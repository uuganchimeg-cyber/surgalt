type MathLoaderProps = {
  label?: string;
  mode?: "screen" | "section";
};

export function MathLoader({
  label = "Сургалтын мэдээлэл ачаалж байна",
  mode = "section",
}: MathLoaderProps) {
  return (
    <div
      aria-label={label}
      aria-live="polite"
      className={`math-loader math-loader--${mode}`}
      role="status"
    >
      <div className="math-loader__card">
        <div aria-hidden="true" className="math-loader__visual">
          <div className="math-loader__grid" />
          <svg className="math-loader__graph" viewBox="0 0 140 100">
            <path className="math-loader__axis" d="M15 50h110M70 12v76" />
            <path className="math-loader__curve" d="M18 76c18-1 18-44 36-44s18 36 36 36 18-24 32-42" />
            <circle className="math-loader__point" cx="90" cy="68" r="4" />
          </svg>
          <span className="math-loader__symbol math-loader__symbol--one">∑</span>
          <span className="math-loader__symbol math-loader__symbol--two">π</span>
          <span className="math-loader__symbol math-loader__symbol--three">x²</span>
        </div>
        <div className="math-loader__copy">
          <span className="math-loader__brand">Эрдэм</span>
          <span className="math-loader__label">{label}</span>
          <span aria-hidden="true" className="math-loader__progress">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
      </div>
    </div>
  );
}
