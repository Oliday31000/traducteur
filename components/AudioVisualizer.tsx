
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isActive: boolean;
  audioContext: AudioContext | null;
  sourceNode: MediaStreamAudioSourceNode | null;
  color?: string;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ 
  isActive, 
  audioContext, 
  sourceNode, 
  color = '#60a5fa' 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Fix: Provide initial value null to satisfy useRef signature and handle "Expected 1 arguments, but got 0"
  const requestRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!isActive || !audioContext || !sourceNode || !canvasRef.current) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      return;
    }

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    sourceNode.connect(analyser);
    analyserRef.current = analyser;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    const draw = () => {
      requestRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;

        ctx.fillStyle = color;
        // Make bars rounded
        ctx.beginPath();
        ctx.roundRect(x, canvas.height - barHeight, barWidth, barHeight, 5);
        ctx.fill();

        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (analyserRef.current) {
        analyserRef.current.disconnect();
      }
    };
  }, [isActive, audioContext, sourceNode, color]);

  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={60} 
      className="w-full h-16 opacity-80"
    />
  );
};

export default AudioVisualizer;
