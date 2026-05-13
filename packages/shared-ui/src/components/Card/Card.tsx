import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Card({ className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-gray-100 bg-white p-4 shadow-sm ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
