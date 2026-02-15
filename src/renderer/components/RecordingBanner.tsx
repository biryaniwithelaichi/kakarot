interface RecordingBannerProps {
  title: string;
  onBackToMeeting: () => void;
}

export default function RecordingBanner({ title, onBackToMeeting }: RecordingBannerProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-amber-500/40 bg-amber-900/30 text-amber-100">
      <div className="text-sm font-medium">{title || 'Meeting'} - Transcription in Progress</div>
      <button
        className="text-xs px-3 py-1.5 rounded-md bg-[#0C0C0C] text-white hover:bg-[#1E1E1E]"
        onClick={onBackToMeeting}
      >
        Back to the meeting
      </button>
    </div>
  );
}
