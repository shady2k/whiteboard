'use client';

interface PageNavProps {
  currentIndex: number;
  totalPages: number;
  onGoToPage: (index: number) => void;
  onAddPage: () => void;
  onDeletePage: () => void;
  sessionName: string;
}

export default function PageNav({
  currentIndex,
  totalPages,
  onGoToPage,
  onAddPage,
  onDeletePage,
  sessionName,
}: PageNavProps) {
  return (
    <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/85 backdrop-blur-md rounded-xl px-3 py-1.5 flex items-center gap-3 shadow-xl">
      <a
        href="/"
        className="text-neutral-400 no-underline text-base px-2 py-1 rounded-md transition-colors hover:bg-white/10 hover:text-white"
        title="Back to sessions"
      >
        &#x2190;
      </a>
      <span className="text-neutral-500 text-sm max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
        {sessionName}
      </span>
      <div className="flex items-center gap-1">
        <button
          className="w-8 h-8 rounded-md flex items-center justify-center text-sm cursor-pointer transition-colors border-none bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-default"
          onClick={() => onGoToPage(currentIndex - 1)}
          disabled={currentIndex === 0}
          title="Previous page"
        >
          &#x25C0;
        </button>
        <span className="text-neutral-400 text-sm min-w-[50px] text-center tabular-nums">
          {currentIndex + 1} / {totalPages}
        </span>
        <button
          className="w-8 h-8 rounded-md flex items-center justify-center text-sm cursor-pointer transition-colors border-none bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-default"
          onClick={() => onGoToPage(currentIndex + 1)}
          disabled={currentIndex >= totalPages - 1}
          title="Next page"
        >
          &#x25B6;
        </button>
        <button
          className="w-8 h-8 rounded-md flex items-center justify-center text-sm cursor-pointer transition-colors border-none bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white"
          onClick={onAddPage}
          title="Add page"
        >
          +
        </button>
        <button
          className="w-8 h-8 rounded-md flex items-center justify-center text-sm cursor-pointer transition-colors border-none bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-default"
          onClick={onDeletePage}
          disabled={totalPages <= 1}
          title="Delete page"
        >
          &#x2212;
        </button>
      </div>
    </div>
  );
}
