import React from "react";

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export function TextInput({ error, className = "", ...rest }: TextInputProps) {
  return (
    <input
      className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
        error
          ? "border-red-500 focus:ring-red-500"
          : "border-gray-300 focus:border-indigo-500"
      } ${className}`}
      {...rest}
    />
  );
}
