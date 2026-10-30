"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export type StyledSelectOption = {
  value: string;
  label: string;
};

type StyledSelectProps = {
  ariaLabel: string;
  className?: string;
  defaultValue?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  onChange?: (value: string) => void;
  options: StyledSelectOption[];
  placeholder?: string;
  required?: boolean;
  value?: string;
};

export function StyledSelect({
  ariaLabel,
  className = "",
  defaultValue = "",
  disabled = false,
  id,
  name,
  onChange,
  options,
  placeholder = "Сонгох",
  required = false,
  value,
}: StyledSelectProps) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listboxId = `${generatedId}-options`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [opensAbove, setOpensAbove] = useState(false);
  const selectedValue = value === undefined ? internalValue : value;
  const selectedIndex = options.findIndex((option) => option.value === selectedValue);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  function openMenu() {
    if (disabled || options.length === 0) return;
    const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
    setActiveIndex(nextIndex);
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (triggerRect) {
      const estimatedHeight = Math.min(260, options.length * 40 + 10);
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      setOpensAbove(spaceBelow < estimatedHeight && spaceAbove > spaceBelow);
    }
    setIsOpen(true);
  }

  function closeMenu() {
    setIsOpen(false);
  }

  function chooseOption(option: StyledSelectOption) {
    if (value === undefined) setInternalValue(option.value);
    onChange?.(option.value);
    closeMenu();
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (options.length === 0) return;
      if (!isOpen) {
        openMenu();
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) =>
        (current + direction + options.length) % options.length,
      );
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      if (!isOpen || options.length === 0) return;
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!isOpen) {
        openMenu();
      } else if (options[activeIndex]) {
        chooseOption(options[activeIndex]);
      }
      return;
    }

    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeMenu();
    } else if (event.key === "Tab") {
      closeMenu();
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [isOpen]);

  useEffect(() => {
    if (value !== undefined) return;
    const form = rootRef.current?.closest("form");
    if (!form) return;
    const resetToDefault = () => {
      window.setTimeout(() => {
        setInternalValue(defaultValue);
        setIsOpen(false);
      }, 0);
    };
    form.addEventListener("reset", resetToDefault);
    return () => form.removeEventListener("reset", resetToDefault);
  }, [defaultValue, value]);

  return (
    <div
      className={`custom-select${isOpen ? " custom-select-open" : ""}`}
      ref={rootRef}
    >
      <button
        aria-activedescendant={isOpen ? `${listboxId}-${activeIndex}` : undefined}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-required={required || undefined}
        className={`custom-select-trigger ${className}`.trim()}
        disabled={disabled}
        id={triggerId}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span className="custom-select-value">
          {selectedOption?.label ?? placeholder}
        </span>
        <svg
          aria-hidden="true"
          className="custom-select-chevron"
          fill="none"
          height="16"
          viewBox="0 0 24 24"
          width="16"
        >
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        </svg>
      </button>
      {name && <input name={name} readOnly type="hidden" value={selectedValue} />}
      {isOpen && (
        <div
          aria-label={ariaLabel}
          className={`custom-select-menu${opensAbove ? " opens-above" : ""}`}
          id={listboxId}
          role="listbox"
        >
          {options.map((option, index) => (
            <button
              aria-selected={option.value === selectedValue}
              className={`custom-select-option${index === activeIndex ? " active" : ""}${option.value === selectedValue ? " selected" : ""}`}
              id={`${listboxId}-${index}`}
              key={`${option.value}-${index}`}
              onClick={() => chooseOption(option)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              type="button"
            >
              <span>{option.label}</span>
              <svg
                aria-hidden="true"
                className="custom-select-check"
                fill="none"
                height="15"
                viewBox="0 0 24 24"
                width="15"
              >
                <path d="m5 12 4 4L19 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
