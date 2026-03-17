import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import LoadingWidget from "./LoadingWidget";
import TimerWidget from "./TimerWidget";
import BBoxWidget from "./BBoxWidget";
import SearchWidget from "./SearchWidget";
import ChatWidget from "./ChatWidget";
import HowToWidget from "./HowToWidget";
import ItemListWidget from "./ItemListWidget";

function EmptySlot() {
  return (
    <div className="w-full h-full rounded-card border-2 border-dashed border-border flex items-center justify-center">
      <span className="text-text-secondary text-sm font-medium">Ready</span>
    </div>
  );
}

const WIDGET_MAP = {
  loading: LoadingWidget,
  timer: TimerWidget,
  bbox: BBoxWidget,
  search: SearchWidget,
  chat: ChatWidget,
  how_to: HowToWidget,
  item_list: ItemListWidget,
};

export default function WidgetManager({ slot, onTimerDone }) {
  const type = slot?.type || "empty";
  const Component = WIDGET_MAP[type];
  // Unique key so AnimatePresence detects changes between different widgets
  const key = type === "empty" ? "empty" : `${type}-${slot.data?.label || slot.data?.ingredient || slot.data?.task || slot.data?.step_name || ""}-${slot.data?.duration || ""}`;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={key}
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full h-full"
      >
        {Component ? (
          <Component {...(slot.data || {})} context={slot.context} onTimerDone={onTimerDone} />
        ) : (
          <EmptySlot />
        )}
      </motion.div>
    </AnimatePresence>
  );
}
