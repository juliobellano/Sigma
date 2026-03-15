import React from "react";
import { motion } from "framer-motion";
import CardShell from "./CardShell";

export default function SearchWidget({ ingredient = "", substitutes = [] }) {
  return (
    <CardShell className="w-full h-full flex flex-col p-5 overflow-y-auto">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-1">
        Substitute for
      </h3>
      <p className="text-lg font-semibold text-text-primary mb-4">{ingredient}</p>
      <ul className="flex flex-col gap-2">
        {substitutes.map((sub, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: i * 0.08 }}
            className="flex items-center justify-between bg-surface rounded-xl px-4 py-2.5"
          >
            <span className="text-sm font-medium text-text-primary">{sub.name}</span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                sub.available
                  ? "bg-accent-green/10 text-accent-green"
                  : "bg-gray-100 text-text-secondary"
              }`}
            >
              {sub.available ? "In your kitchen!" : "Not found"}
            </span>
          </motion.li>
        ))}
      </ul>
    </CardShell>
  );
}
