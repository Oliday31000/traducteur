export interface TranscriptItem {
  id: string;
  source: 'user' | 'model';
  text: string;
  isComplete: boolean;
  timestamp: Date;
}

export interface AudioConfig {
  inputSampleRate: number;
  outputSampleRate: number;
}
