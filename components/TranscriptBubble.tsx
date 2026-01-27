import React from 'react';
import { TranscriptItem } from '../types';

interface TranscriptBubbleProps {
  item: TranscriptItem;
}

export const TranscriptBubble: React.FC<TranscriptBubbleProps> = ({ item }) => {
  const isUser = item.source === 'user';
  
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div 
        className={`max-w-[80%] rounded-2xl px-6 py-4 shadow-lg backdrop-blur-sm transition-all duration-300 ${
          isUser 
            ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100 rounded-tr-sm' 
            : 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-100 rounded-tl-sm'
        }`}
      >
        <div className="flex items-center gap-2 mb-1 opacity-70 text-xs uppercase tracking-wider font-semibold">
          {isUser ? (
            <>
              <span>Original (You)</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
              <span>Translation (Gemini)</span>
            </>
          )}
        </div>
        <p className="text-lg leading-relaxed whitespace-pre-wrap">
          {item.text}
          {!item.isComplete && (
            <span className="inline-block w-2 h-4 ml-1 align-middle bg-current opacity-50 animate-pulse"/>
          )}
        </p>
      </div>
    </div>
  );
};