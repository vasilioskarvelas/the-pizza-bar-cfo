import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home } from 'lucide-react';

export default function FloatingHomeButton() {
  const { pathname } = useLocation();
  if (pathname === '/') return null;
  return (
    <Link
      to="/"
      aria-label="Go to home"
      className="fixed bottom-5 right-5 z-50 flex items-center justify-center w-11 h-11 rounded-full bg-primary text-primary-foreground shadow-lg border border-border hover:opacity-90 transition-opacity"
    >
      <Home className="w-5 h-5" />
    </Link>
  );
}