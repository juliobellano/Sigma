import React from "react";

const MAX_VISIBLE = 10;

export default function TutorialProgressBar({ steps, currentIndex }) {
  if (!steps || steps.length === 0) return null;

  // Compute the visible window of up to MAX_VISIBLE steps
  let windowStart = 0;
  if (steps.length > MAX_VISIBLE) {
    windowStart = Math.max(0, Math.min(currentIndex - 4, steps.length - MAX_VISIBLE));
  }
  const visible = steps.slice(windowStart, windowStart + MAX_VISIBLE);

  const currentStep = steps[currentIndex];

  return (
    <div className="w-full max-w-[1440px] px-2">
      {/* Step dots + connector line */}
      <div className="relative flex items-center justify-between">
        {/* Connector line behind the dots */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-border z-0" />

        {visible.map((step, i) => {
          const globalIdx = windowStart + i;
          const isDone = globalIdx < currentIndex;
          const isCurrent = globalIdx === currentIndex;

          return (
            <div key={step.step_number} className="relative z-10 flex flex-col items-center gap-1">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300
                  ${isDone
                    ? "bg-accent-green border-accent-green text-white"
                    : isCurrent
                    ? "bg-text-primary border-text-primary text-white scale-110 shadow-md"
                    : "bg-surface border-border text-text-secondary"
                  }
                `}
              >
                {isDone ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  globalIdx + 1
                )}
              </div>
              {isCurrent && (
                <span className="absolute top-9 text-[10px] font-semibold text-text-primary whitespace-nowrap max-w-[80px] truncate text-center">
                  {step.step_name}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Current step label below */}
      {currentStep && (
        <div className="mt-8 text-center">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Step {currentIndex + 1} of {steps.length}
          </span>
          <p className="text-sm font-semibold text-text-primary mt-0.5 truncate">
            {currentStep.step_name}
          </p>
        </div>
      )}
    </div>
  );
}
