import React from "react";
import { motion } from "framer-motion";
import CardShell from "./CardShell";

export default function ChatWidget({ text = "" }) {
  return (
    <CardShell className="w-full h-full flex items-center justify-center p-6">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="text-base text-text-primary text-center leading-relaxed"
      >
        {text}
      </motion.p>
    </CardShell>
  );
}
