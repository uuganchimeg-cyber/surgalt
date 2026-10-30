"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  ButtonHTMLAttributes,
  FormEvent,
  FormHTMLAttributes,
  MouseEvent,
  ReactNode,
} from "react";

type Action = () => unknown | Promise<unknown>;
type ProgressRunner = {
  progress: number | null;
  run: (action: Action) => Promise<boolean>;
};

const ActionProgressContext = createContext<ProgressRunner | null>(null);

function useProgressRunner(): ProgressRunner {
  const [progress, setProgress] = useState<number | null>(null);
  const runningRef = useRef(false);
  const intervalRef = useRef<number | null>(null);
  const resetRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      if (resetRef.current !== null) window.clearTimeout(resetRef.current);
    },
    [],
  );

  const run = useCallback(async (action: Action) => {
    if (runningRef.current) return false;
    runningRef.current = true;
    setProgress(0);
    intervalRef.current = window.setInterval(() => {
      setProgress((current) => {
        if (current === null) return null;
        return Math.min(95, current + Math.max(2, Math.ceil((95 - current) * 0.16)));
      });
    }, 120);

    try {
      const result = await action();
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (result === false) {
        runningRef.current = false;
        setProgress(null);
        return false;
      }
      setProgress(100);
      resetRef.current = window.setTimeout(() => {
        runningRef.current = false;
        setProgress(null);
        resetRef.current = null;
      }, 450);
      return true;
    } catch (error) {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      runningRef.current = false;
      setProgress(null);
      throw error;
    }
  }, []);

  return { progress, run };
}

export function ProgressActionGroup({ children }: { children: ReactNode }) {
  const runner = useProgressRunner();
  return (
    <ActionProgressContext.Provider value={runner}>
      {children}
    </ActionProgressContext.Provider>
  );
}

type ProgressFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  onSubmit: (event: FormEvent<HTMLFormElement>) => unknown | Promise<unknown>;
  onComplete?: () => void;
};

export function ProgressForm({
  children,
  onSubmit,
  onComplete,
  ...props
}: ProgressFormProps) {
  const runner = useProgressRunner();
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runner
      .run(() => onSubmit(event))
      .then((completed) => {
        if (completed && onComplete) window.setTimeout(onComplete, 450);
      })
      .catch(() => {});
  }

  return (
    <ActionProgressContext.Provider value={runner}>
      <form {...props} onSubmit={handleSubmit}>
        {children}
      </form>
    </ActionProgressContext.Provider>
  );
}

type ProgressButtonClick = (
  event: MouseEvent<HTMLButtonElement>,
) => unknown | Promise<unknown>;

type ProgressButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick"
> & {
  onClick?: ProgressButtonClick;
  loadingLabel?: string;
  onComplete?: () => void;
};

export function ProgressButton({
  children,
  className = "",
  disabled,
  loadingLabel = "Хадгалж байна",
  onClick,
  onComplete,
  type = "button",
  ...props
}: ProgressButtonProps) {
  const contextRunner = useContext(ActionProgressContext);
  const localRunner = useProgressRunner();
  const runner = contextRunner ?? localRunner;
  const isRunning = runner.progress !== null;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (!onClick || type === "submit") return;
    void runner
      .run(() => onClick(event))
      .then((completed) => {
        if (completed && onComplete) window.setTimeout(onComplete, 450);
      })
      .catch(() => {});
  }

  return (
    <button
      {...props}
      aria-busy={isRunning || undefined}
      className={`action-progress-button ${className}`.trim()}
      disabled={disabled || isRunning}
      onClick={handleClick}
      type={type}
    >
      {isRunning ? (
        <span aria-live="polite" className="action-progress-label">
          <span>{loadingLabel}</span>
          <strong>{runner.progress}%</strong>
        </span>
      ) : (
        children
      )}
      {isRunning && (
        <span aria-hidden="true" className="action-progress-track">
          <span style={{ width: `${runner.progress}%` }} />
        </span>
      )}
    </button>
  );
}
