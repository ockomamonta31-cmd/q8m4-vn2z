// Единый набор inline-иконок: тонкая обводка 1.7, скруглённые концы.
// Все иконки decorative по умолчанию — доступное имя даёт родитель.

type P = { className?: string; size?: number };

function S({ className, size = 16, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const Icon = {
  Copy: (p: P) => <S {...p}><rect x="7" y="7" width="9" height="10" rx="2" /><path d="M13 4H5a2 2 0 0 0-2 2v8" /></S>,
  Check: (p: P) => <S {...p}><path d="m4 10.5 4 4 8-9" /></S>,
  External: (p: P) => <S {...p}><path d="M11 4h5v5M16 4 9 11" /><path d="M14 12v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3" /></S>,
  ArrowLeft: (p: P) => <S {...p}><path d="M16 10H4m5-5-5 5 5 5" /></S>,
  ArrowRight: (p: P) => <S {...p}><path d="M4 10h12m-5-5 5 5-5 5" /></S>,
  Chevron: (p: P) => <S {...p}><path d="m5 8 5-4 5 4" /></S>,
  Crown: (p: P) => <S {...p}><path d="M3 15h14M3.5 6.5 6 10l4-6 4 6 2.5-3.5L18 15H2z" /></S>,
  Sword: (p: P) => <S {...p}><path d="M16 3v4l-8 8-3-3 8-8h3zM5 12l-2 5 5-2" /></S>,
  Shield: (p: P) => <S {...p}><path d="M10 2.5 16 5v5c0 4-2.6 6.5-6 7.5C6.6 16.5 4 14 4 10V5z" /></S>,
  Coin: (p: P) => <S {...p}><circle cx="10" cy="10" r="7" /><path d="M10 6.5v7M12.2 8.2c-.5-.6-3.4-.8-3.4.9s3.6.9 3.6 2.6c0 1.6-2.9 1.5-3.5.8" /></S>,
  Bolt: (p: P) => <S {...p}><path d="M11.5 2 4.5 11h4l-1 7 7-9h-4z" /></S>,
  Heart: (p: P) => <S {...p}><path d="M10 16.5S3.5 12.7 3.5 8.3A3.3 3.3 0 0 1 10 6.6a3.3 3.3 0 0 1 6.5 1.7c0 4.4-6.5 8.2-6.5 8.2z" /></S>,
  Tower: (p: P) => <S {...p}><path d="M6 18V7l4-4 4 4v11zM8 18v-4h4v4M6 10h8" /></S>,
  Roshan: (p: P) => <S {...p}><path d="M10 2.5c3.6 0 6 2.5 6 5.8 0 2-.9 3.2-1.8 4L14 15.5H6L5.8 12.3C4.9 11.5 4 10.3 4 8.3c0-3.3 2.4-5.8 6-5.8z" /><circle cx="7.6" cy="9" r="1.2" fill="currentColor" stroke="none" /><circle cx="12.4" cy="9" r="1.2" fill="currentColor" stroke="none" /></S>,
  Blood: (p: P) => <S {...p}><path d="M10 2.5s5 5.4 5 8.7a5 5 0 0 1-10 0c0-3.3 5-8.7 5-8.7z" /></S>,
  Flame: (p: P) => <S {...p}><path d="M10 17.5c2.8 0 4.8-1.9 4.8-4.5 0-3.9-4.3-5.2-3.4-9.3C9 4.8 6.4 6.6 6.4 9.3c0 1.3.5 2 .5 2-1.3.3-1.7 1.5-1.7 2.3 0 2.3 2.2 3.9 4.8 3.9z" /></S>,
  Clock: (p: P) => <S {...p}><circle cx="10" cy="10" r="7.2" /><path d="M10 5.6V10l3 2" /></S>,
  Calendar: (p: P) => <S {...p}><rect x="3.5" y="5" width="13" height="11.5" rx="2" /><path d="M3.5 9h13M7.5 3v4m5-4v4" /></S>,
  Users: (p: P) => <S {...p}><circle cx="8" cy="7.5" r="3" /><path d="M2.8 16.5c.4-2.7 2.6-4.2 5.2-4.2s4.8 1.5 5.2 4.2" /><path d="M14 5.2a3 3 0 0 1 0 5.6M15.5 12.8c1.6.6 2.6 1.9 2.9 3.7" /></S>,
  Search: (p: P) => <S {...p}><circle cx="8.6" cy="8.6" r="5.4" /><path d="m12.7 12.7 4 4" /></S>,
  Sun: (p: P) => <S {...p}><circle cx="10" cy="10" r="3.4" /><path d="M10 2v2m0 12v2M2 10h2m12 0h2M4.3 4.3 5.7 5.7m8.6 8.6 1.4 1.4m0-11.4L14.3 5.7M5.7 14.3l-1.4 1.4" /></S>,
  Moon: (p: P) => <S {...p}><path d="M16.4 12.2A7 7 0 0 1 7.8 3.6a7 7 0 1 0 8.6 8.6z" /></S>,
  Logout: (p: P) => <S {...p}><path d="M8 3H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3m2.5-3 4-4-4-4M11.5 10H16" /></S>,
  Chart: (p: P) => <S {...p}><path d="M3 16.5h14M5 13V8m5 5V4m5 9v-4" /></S>,
  Roster: (p: P) => <S {...p}><path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h8" /></S>,
  Timeline: (p: P) => <S {...p}><path d="M3 10h14" /><circle cx="6" cy="10" r="1.6" fill="currentColor" /><circle cx="11" cy="10" r="1.6" fill="currentColor" /><circle cx="16" cy="10" r="1.6" fill="currentColor" /></S>,
  Draft: (p: P) => <S {...p}><rect x="3" y="4" width="6" height="5" rx="1" /><rect x="11" y="4" width="6" height="5" rx="1" /><rect x="3" y="11" width="6" height="5" rx="1" /><rect x="11" y="11" width="6" height="5" rx="1" /></S>,
  Target: (p: P) => <S {...p}><circle cx="10" cy="10" r="7" /><circle cx="10" cy="10" r="3" /><path d="M10 1.5v3m0 11v3M1.5 10h3m11 0h3" /></S>,
  Trend: (p: P) => <S {...p}><path d="M3 14.5 8 9l3.2 3L17 6" /><path d="M13 6h4v4" /></S>,
  Map: (p: P) => <S {...p}><path d="m3 6 5-2 4 2 5-2v10l-5 2-4-2-5 2z" /><path d="M8 4v10m4-8v10" /></S>,
  Bag: (p: P) => <S {...p}><path d="M4.5 7h11l1 9.5h-13z" /><path d="M7.5 9V6a2.5 2.5 0 0 1 5 0v3" /></S>,
  Spark: (p: P) => <S {...p}><path d="M10 2.5 11.6 7l4.4 1.6L11.6 10 10 17.5 8.4 10 4 8.6 8.4 7z" /></S>,
  Steam: (p: P) => <S {...p}><circle cx="10" cy="10" r="7.6" /><circle cx="12.6" cy="7.6" r="2.1" /><circle cx="7.2" cy="12.4" r="1.7" /><path d="M4.9 13.5 2.9 12.8m11.9-3.9 2.4.8" /></S>,
}
