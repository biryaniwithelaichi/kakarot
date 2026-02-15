export default function ProcessingView() {
  return (
    <div className="flex-1 flex items-center justify-center animate-fade-in">
      <div className="text-center">
        <div className="relative w-14 h-14 mx-auto mb-4">
          <div className="absolute inset-0 rounded-full border-2 border-[#2A2A2A]" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#C17F3E] animate-spin" />
          <div className="absolute inset-2 rounded-full bg-[#C17F3E]/10 animate-glow-pulse" />
        </div>
        <p className="text-base font-medium text-white">Generating Notes</p>
        <p className="text-sm text-slate-400 mt-1">Processing your conversation</p>
      </div>
    </div>
  );
}
