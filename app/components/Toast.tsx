import { getTxUrl } from '../lib/constants';

interface ToastProps {
  message: string;
  signature?: string;
  onClose: () => void;
}

export default function Toast({ message, signature, onClose }: ToastProps) {
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-ink text-white text-sm px-5 py-3 rounded-pill shadow-product animate-bounce max-w-md">
      <div className="flex items-center space-x-3">
        <span>{message}</span>
        {signature && (
          <a
            href={getTxUrl(signature)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-action-blue hover:underline whitespace-nowrap"
            onClick={(e) => e.stopPropagation()}
          >
            View Tx →
          </a>
        )}
        <button onClick={onClose} className="text-white/60 hover:text-white ml-1">✕</button>
      </div>
    </div>
  );
}
