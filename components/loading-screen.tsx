"use client";

import React from "react";
import { motion } from "framer-motion";
import { Package } from "lucide-react";

export const LoadingScreen = () => (
  <div className="h-[100dvh] flex flex-col items-center justify-center bg-slate-50 relative overflow-hidden">
    {/* Abstract Background Decoration */}
    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-50 rounded-full blur-[100px] animate-pulse" />
    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-50 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1s' }} />
    
    <div className="relative z-10 flex flex-col items-center">
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative mb-8"
      >
        {/* Spinning Rings */}
        <div className="w-24 h-24 border-[3px] border-indigo-100 rounded-full" />
        <div className="absolute top-0 left-0 w-24 h-24 border-[3px] border-indigo-600 rounded-full border-t-transparent animate-spin" />
        
        {/* Floating Icon */}
        <motion.div 
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-4 rounded-2xl shadow-xl shadow-indigo-100 border border-indigo-50"
        >
          <Package className="text-indigo-600" size={32} />
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="text-center"
      >
        <h2 className="text-2xl font-black text-slate-800 tracking-tight mb-2">Lista+</h2>
        <div className="flex items-center justify-center gap-2 text-slate-500 font-medium text-sm">
          <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" />
          <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:0.2s]" />
          <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce [animation-delay:0.4s]" />
          <span className="ml-1 uppercase tracking-[0.2em] text-[10px] font-black text-indigo-600/60">Sincronizando</span>
        </div>
      </motion.div>
    </div>

    {/* Progress bar simulation */}
    <div className="absolute bottom-12 w-48 h-1 bg-slate-200 rounded-full overflow-hidden">
      <motion.div 
        initial={{ x: "-100%" }}
        animate={{ x: "100%" }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        className="w-full h-full bg-gradient-to-r from-transparent via-indigo-600 to-transparent"
      />
    </div>
  </div>
);
