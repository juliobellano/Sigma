import React from "react";
import { motion } from "framer-motion";
import CardShell from "./CardShell";

export default function ItemListWidget({ step_name = "", items = [] }) {
  return (
    <CardShell className="w-full h-full flex flex-col p-5 overflow-y-auto">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-1">
        Items needed for
      </h3>
      <p className="text-lg font-semibold text-text-primary mb-4">{step_name}</p>
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: i * 0.08 }}
            className="flex items-center justify-between bg-surface rounded-xl px-4 py-2.5"
          >
            <span className="text-sm font-medium text-text-primary">{item.name}</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-accent-amber/10 text-accent-amber">
              {item.amount || "N/A"}
            </span>
          </motion.li>
        ))}
      </ul>
    </CardShell>
  );
}
