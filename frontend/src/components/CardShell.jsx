import React from "react";

export default function CardShell({ children, className = "" }) {
  return (
    <div
      className={`bg-card border border-border rounded-card shadow-card hover:shadow-card-hover transition-shadow duration-200 ${className}`}
    >
      {children}
    </div>
  );
}
