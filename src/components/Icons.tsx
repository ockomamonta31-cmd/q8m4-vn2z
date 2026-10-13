// Единый набор иконок: сетка 24, штрих 1.75, скруглённые концы.
// Все иконки decorative — доступное имя даёт родитель.

type P = { className?: string; size?: number };

function S({ className, size = 16, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
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
  Copy: (p: P) => <S {...p}><rect x="9" y="9" width="11" height="12" rx="2" /><path d="M15 5H6a2 2 0 0 0-2 2v9" /></S>,
  Check: (p: P) => <S {...p}><path d="m5 12.5 4.5 4.5L19 6.5" /></S>,
  External: (p: P) => <S {...p}><path d="M13 5h6v6M19 5l-8 8" /><path d="M17 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4" /></S>,
  ArrowLeft: (p: P) => <S {...p}><path d="M19 12H5m6-6-6 6 6 6" /></S>,
  Chevron: (p: P) => <S {...p}><path d="m6 9 6 6 6-6" /></S>,
  Crown: (p: P) => <S {...p}><path d="M4 18h16M4.5 6.5 8 11l4-6 4 6 3.5-4.5L20 18H4z" /></S>,
  Sword: (p: P) => <S {...p}><path d="M19 4v5L10 18l-4-4L15 5h4zM6 14l-2.5 6.5L10 18" /></S>,
  Shield: (p: P) => <S {...p}><path d="M12 3l7 2.6v5.6c0 4.4-2.9 7.2-7 8.8-4.1-1.6-7-4.4-7-8.8V5.6z" /></S>,
  Coin: (p: P) => <S {...p}><circle cx="12" cy="12" r="8" /><path d="M12 7.5v9M14.6 9.6c-.6-.8-4-1-4 1.1s4.2 1.1 4.2 3.1c0 1.9-3.4 1.8-4.2 1" /></S>,
  Bolt: (p: P) => <S {...p}><path d="M13.8 2.5 6 13h4.6L10 21.5 18 10.5h-4.7z" /></S>,
  Heart: (p: P) => <S {...p}><path d="M12 20S4 15.2 4 9.9A4 4 0 0 1 12 8a4 4 0 0 1 8 1.9C20 15.2 12 20 12 20z" /></S>,
  Tower: (p: P) => <S {...p}><path d="M7 21V8l5-5 5 5v13zM10 21v-5h4v5M7 11h10" /></S>,
  Roshan: (p: P) => <S {...p}><path d="M12 3c4.3 0 7 3 7 6.9 0 2.4-1 3.9-2.1 4.8L17 19H7l.1-4.3C6 13.8 5 12.3 5 9.9 5 6 7.7 3 12 3z" /><circle cx="9.1" cy="10.7" r="1.3" fill="currentColor" stroke="none" /><circle cx="14.9" cy="10.7" r="1.3" fill="currentColor" stroke="none" /></S>,
  Blood: (p: P) => <S {...p}><path d="M12 3s6 6.4 6 10.4a6 6 0 0 1-12 0C6 9.4 12 3 12 3z" /></S>,
  Flame: (p: P) => <S {...p}><path d="M12 21c3.3 0 5.6-2.2 5.6-5.3 0-4.6-5-6.1-4-11-1.9 1-5 3.2-5 6.4 0 1.5.6 2.4.6 2.4-1.5.4-2.2 1.8-2.2 2.8 0 2.7 2.6 4.7 5 4.7z" /></S>,
  Clock: (p: P) => <S {...p}><circle cx="12" cy="12" r="8.6" /><path d="M12 6.8V12l3.4 2.2" /></S>,
  Calendar: (p: P) => <S {...p}><rect x="4" y="6" width="16" height="14" rx="2" /><path d="M4 10.5h16M8.5 3.5v4m7-4v4" /></S>,
  Users: (p: P) => <S {...p}><circle cx="9.5" cy="8.5" r="3.4" /><path d="M3.4 20c.5-3.1 3-4.9 6.1-4.9s5.6 1.8 6.1 4.9" /><path d="M16 5.6a3.4 3.4 0 0 1 0 5.8M18 15.6c1.7.7 2.7 2.1 3 4.4" /></S>,
  Search: (p: P) => <S {...p}><circle cx="10.5" cy="10.5" r="6.4" /><path d="m15.2 15.2 5 5" /></S>,
  Logout: (p: P) => <S {...p}><path d="M9.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h2.5M13 16l4-4-4-4m4 4H9" /></S>,
  Chart: (p: P) => <S {...p}><path d="M3.5 19.5h17M6.5 15.5V9m5.5 6.5V4.5m5.5 11V11" /></S>,
  Roster: (p: P) => <S {...p}><path d="M4 6.5h16M4 12h16M4 17.5h10" /></S>,
  Timeline: (p: P) => <S {...p}><path d="M3 12h18" /><circle cx="7" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="17" cy="12" r="2" fill="currentColor" stroke="none" /></S>,
  Draft: (p: P) => <S {...p}><rect x="3.5" y="4.5" width="7" height="6" rx="1.5" /><rect x="13.5" y="4.5" width="7" height="6" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="6" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="6" rx="1.5" /></S>,
  Target: (p: P) => <S {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.4" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></S>,
  Trend: (p: P) => <S {...p}><path d="m4 16.5 5.5-6 3.5 3.5L20 7" /><path d="M15.5 7H20v4.5" /></S>,
  Map: (p: P) => <S {...p}><path d="m3.5 6.5 5.5-2.2 6 2.2 5.5-2.2v13.2l-5.5 2.2-6-2.2-5.5 2.2z" /><path d="M9 4.3v13.2m6-11v13.2" /></S>,
  Bag: (p: P) => <S {...p}><path d="M5 8h14l1.2 11.5H3.8z" /><path d="M8.5 10.5V6.8a3.5 3.5 0 0 1 7 0v3.7" /></S>,
  Spark: (p: P) => <S {...p}><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" /></S>,
  Steam: (p: P) => <S {...p}><circle cx="12" cy="12" r="9.2" /><circle cx="15.2" cy="9" r="2.6" /><circle cx="8.6" cy="14.8" r="2.1" /><path d="m5.8 16.2-2.6-.9m14.6-4.8 3 1" /></S>,
}
