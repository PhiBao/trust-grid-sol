import React from 'react';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-ink/5 rounded-utility ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="apple-card p-5">
      <div className="flex items-start justify-between mb-4">
        <Skeleton className="w-10 h-10 rounded-utility" />
        <Skeleton className="w-16 h-5 rounded-pill" />
      </div>
      <Skeleton className="w-3/4 h-5 mb-2" />
      <Skeleton className="w-full h-4 mb-1" />
      <Skeleton className="w-2/3 h-4 mb-4" />
      <div className="flex items-center justify-between">
        <Skeleton className="w-16 h-4" />
        <Skeleton className="w-20 h-4" />
      </div>
      <div className="mt-4 pt-4 border-t border-hairline flex items-center justify-between">
        <Skeleton className="w-12 h-3" />
        <Skeleton className="w-14 h-4 rounded-utility" />
      </div>
    </div>
  );
}

export function SkeletonTaskRow() {
  return (
    <div className="bg-white rounded-card border border-hairline p-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-1">
            <Skeleton className="w-24 h-5" />
            <Skeleton className="w-14 h-4 rounded-utility" />
          </div>
          <Skeleton className="w-48 h-4 mb-1" />
          <Skeleton className="w-32 h-3" />
        </div>
        <div className="flex items-center space-x-3">
          <Skeleton className="w-20 h-8 rounded-pill" />
          <Skeleton className="w-16 h-3" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonStat() {
  return (
    <div className="text-center">
      <Skeleton className="w-16 h-10 mx-auto mb-1" />
      <Skeleton className="w-24 h-4 mx-auto" />
    </div>
  );
}
