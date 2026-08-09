'use client';

import { useState } from 'react';
import Link from 'next/link';

const STATUSES = ['All', 'Saved', 'Applied', 'Interview', 'Offer', 'Rejected', 'Declined'];
const CATEGORIES = [
  { id: 'all', label: '📋 All' },
  { id: 'remote-worldwide', label: '🌐 Remote Worldwide – React' },
  { id: 'local-hybrid', label: '🏠 Local Hybrid' },
  { id: 'local-onsite', label: '🏢 Local Onsite' },
];

const MOCK_JOBS = [
  {
    id: 1,
    title: 'Senior React Developer',
    company: 'Google',
    location: 'Remote worldwide',
    visa: 'Visa: Global EOR',
    type: 'Remote',
    date: 'Aug 3',
    status: 'Applied',
    salary: '$150k - $200k',
    experience: '5+ years',
    description:
      'Build and maintain large-scale web applications using React, TypeScript, and modern frontend technologies. Work with cross-functional teams to deliver high-quality user experiences.',
  },
  {
    id: 2,
    title: 'Frontend Lead',
    company: 'Meta',
    location: 'NYC · Hybrid',
    visa: 'Visa: Sponsored',
    type: 'Hybrid',
    date: 'Aug 2',
    status: 'Saved',
    salary: '$180k - $220k',
    experience: '7+ years',
    description:
      'Lead a team of frontend engineers building the next generation of social experiences. Define technical direction and mentor junior developers.',
  },
  {
    id: 3,
    title: 'Full Stack Developer',
    company: 'Startup Inc',
    location: 'London · Onsite',
    visa: 'Visa: Required',
    type: 'Onsite',
    date: 'Aug 1',
    status: 'Saved',
    salary: '£80k - £100k',
    experience: '3-7 years',
    description:
      'Join our small team to build innovative fintech products from the ground up. Work across the entire stack with modern technologies.',
  },
  {
    id: 4,
    title: 'UI Engineer',
    company: 'Amazon',
    location: 'Remote worldwide',
    visa: 'Visa: Global EOR',
    type: 'Remote',
    date: 'Jul 30',
    status: 'Interview',
    salary: '$160k - $190k',
    experience: '5+ years',
    description:
      'Create beautiful, accessible user interfaces for millions of customers. Focus on performance, accessibility, and design systems.',
  },
  {
    id: 5,
    title: 'React Developer',
    company: 'Netflix',
    location: 'Remote worldwide',
    visa: 'Visa: US Only',
    type: 'Remote',
    date: 'Jul 28',
    status: 'Applied',
    salary: '$140k - $180k',
    experience: '3-5 years',
    description:
      'Work on streaming platform features used by millions globally. Collaborate with product and design teams to build engaging video experiences.',
  },
  {
    id: 6,
    title: 'Senior Frontend Dev',
    company: 'Shopify',
    location: 'Toronto · Hybrid',
    visa: 'Visa: Sponsored',
    type: 'Hybrid',
    date: 'Jul 25',
    status: 'Offer',
    salary: 'CAD$140k+',
    experience: '6+ years',
    description:
      "Build merchant-facing tools and features for one of the world's largest e-commerce platforms. Solve complex problems at scale.",
  },
];

const NavigationBubbles = ({ current }: { current: number }) => (
  <div
    className="fixed bottom-8 right-8 flex gap-2.5 rounded-2xl border p-3 shadow-2xl"
    style={{ backgroundColor: 'hsl(198 100% 5%)', borderColor: 'hsl(195 100% 12%)' }}
  >
    {[1, 2, 3, 4, 5, 6, 7].map((num) => {
      const isActive = num === current;
      return (
        <Link
          key={num}
          href={`/${num}`}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-semibold transition-all duration-200"
          style={{
            background: isActive
              ? 'linear-gradient(135deg, hsl(190 100% 42%) 0%, hsl(205 100% 48%) 100%)'
              : 'hsl(193 100% 15%)',
            color: isActive ? 'hsl(194 100% 88%)' : 'hsl(194 65% 62%)',
            boxShadow: isActive ? '0 4px 16px hsl(190 100% 42% / 0.4)' : 'none',
          }}
        >
          {num}
        </Link>
      );
    })}
  </div>
);

const primaryButtonClass =
  'transition-[filter,box-shadow] duration-200 ease-out hover:brightness-105';

const secondaryButtonClass =
  'transition-[background-color,border-color,color,box-shadow] duration-200 ease-out';

type FiltersCardProps = {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  selectedStatuses: string[];
  onToggleStatus: (status: string) => void;
};

const FiltersCard = ({
  searchQuery,
  onSearchChange,
  selectedStatuses,
  onToggleStatus,
}: FiltersCardProps) => {
  return (
    <div
      className="rounded-2xl border p-5 shadow-lg"
      style={{
        backgroundColor: 'hsl(198 100% 5%)',
        borderColor: 'hsl(195 100% 12%)',
      }}
    >
      <div className="mb-5 flex items-stretch gap-3">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
            <svg
              className="h-5 w-5"
              style={{ color: 'hsl(194 65% 62% / 0.5)' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search by title, company, or location..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-xl border py-3.5 pl-12 pr-4 shadow-sm"
            style={{
              borderColor: 'hsl(195 100% 12%)',
              backgroundColor: 'hsl(205 100% 4%)',
              color: 'hsl(194 100% 88%)',
              outline: 'none',
              transition: 'all 0.2s ease',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'hsl(190 100% 42%)';
              e.target.style.boxShadow = '0 0 0 3px hsl(190 100% 42% / 0.2)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'hsl(195 100% 12%)';
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>

        <button
          className={`shrink-0 rounded-lg px-6 py-2.5 text-sm font-semibold [box-shadow:0_4px_16px_hsl(190_100%_42%_/_0.4)] hover:[box-shadow:0_6px_20px_hsl(190_100%_42%_/_0.48)] ${primaryButtonClass}`}
          style={{
            background: 'linear-gradient(135deg, hsl(190 100% 42%) 0%, hsl(205 100% 48%) 100%)',
            color: 'hsl(194 100% 88%)',
          }}
        >
          <span className="flex items-center gap-2">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Job
          </span>
        </button>
      </div>

      <div className="border-t pt-4" style={{ borderColor: 'hsl(195 100% 12%)' }}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold" style={{ color: 'hsl(194 65% 62%)' }}>
            Status
          </span>
          <span className="text-xs" style={{ color: 'hsl(194 65% 62% / 0.7)' }}>
            Multi-select
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => {
            const isSelected = selectedStatuses.includes(status);
            return (
              <button
                key={status}
                onClick={() => onToggleStatus(status)}
                className="rounded-lg border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,box-shadow] duration-200 ease-out"
                style={{
                  background: isSelected
                    ? 'linear-gradient(135deg, hsl(190 100% 40%) 0%, hsl(190 100% 45%) 100%)'
                    : 'hsl(205 100% 4%)',
                  color: isSelected ? 'hsl(194 100% 88%)' : 'hsl(194 65% 62%)',
                  borderColor: isSelected ? 'hsl(190 100% 40%)' : 'hsl(195 100% 12%)',
                  boxShadow: isSelected ? '0 3px 12px hsl(190 100% 40% / 0.3)' : 'none',
                }}
              >
                {status}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default function ListingsPage1() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(['All']);
  const [activeCategory, setActiveCategory] = useState('all');
  const [jobs, setJobs] = useState(MOCK_JOBS);

  const toggleStatus = (status: string) => {
    if (status === 'All') {
      setSelectedStatuses(['All']);
    } else {
      const newStatuses = selectedStatuses.includes(status)
        ? selectedStatuses.filter((s) => s !== status && s !== 'All')
        : [...selectedStatuses.filter((s) => s !== 'All'), status];
      setSelectedStatuses(newStatuses.length === 0 ? ['All'] : newStatuses);
    }
  };

  const changeJobStatus = (jobId: number, newStatus: string) => {
    setJobs(jobs.map((job) => (job.id === jobId ? { ...job, status: newStatus } : job)));
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
      Saved: {
        bg: 'hsl(194 65% 62% / 0.15)',
        text: 'hsl(194 65% 62%)',
        border: 'hsl(194 65% 62% / 0.3)',
      },
      Applied: {
        bg: 'hsl(217 100% 70% / 0.15)',
        text: 'hsl(217 100% 70%)',
        border: 'hsl(217 100% 70% / 0.3)',
      },
      Interview: {
        bg: 'hsl(190 100% 42% / 0.15)',
        text: 'hsl(190 100% 55%)',
        border: 'hsl(190 100% 42% / 0.3)',
      },
      Offer: {
        bg: 'hsl(162 100% 22% / 0.3)',
        text: 'hsl(162 100% 42%)',
        border: 'hsl(162 100% 22% / 0.5)',
      },
      Rejected: {
        bg: 'hsl(7 100% 66% / 0.15)',
        text: 'hsl(7 100% 66%)',
        border: 'hsl(7 100% 66% / 0.3)',
      },
      Declined: {
        bg: 'hsl(53 100% 21% / 0.3)',
        text: 'hsl(53 100% 51%)',
        border: 'hsl(53 100% 21% / 0.5)',
      },
    };
    return colors[status] || colors.Saved;
  };

  const getStatusDotColor = (status: string) => {
    const colors: Record<string, string> = {
      Saved: 'hsl(194 65% 62%)',
      Applied: 'hsl(217 100% 70%)',
      Interview: 'hsl(190 100% 55%)',
      Offer: 'hsl(162 100% 42%)',
      Rejected: 'hsl(7 100% 66%)',
      Declined: 'hsl(53 100% 51%)',
    };
    return colors[status] || 'hsl(194 65% 62%)';
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'hsl(220 100% 4%)' }}>
      <div
        className="border-b backdrop-blur-sm"
        style={{ borderColor: 'hsl(195 100% 12%)', backgroundColor: 'hsl(198 100% 5% / 0.6)' }}
      >
        <div className="mx-auto max-w-5xl px-6 py-5">
          <FiltersCard
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedStatuses={selectedStatuses}
            onToggleStatus={toggleStatus}
          />

          <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className="whitespace-nowrap rounded-lg border px-5 py-2.5 text-sm font-medium transition-[background-color,border-color,color] duration-200 ease-out"
                  style={{
                    background: isActive
                      ? 'linear-gradient(135deg, hsl(193 100% 15%) 0%, hsl(193 100% 17%) 100%)'
                      : 'transparent',
                    color: isActive ? 'hsl(194 100% 88%)' : 'hsl(194 65% 62%)',
                    borderColor: isActive ? 'hsl(190 100% 42%)' : 'transparent',
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="space-y-4">
          {jobs.map((job) => {
            const statusColors = getStatusColor(job.status);
            return (
              <div
                key={job.id}
                className="rounded-2xl border p-7 shadow-lg"
                style={{
                  backgroundColor: 'hsl(205 100% 4%)',
                  borderColor: 'hsl(195 100% 12%)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'hsl(190 100% 42% / 0.4)';
                  e.currentTarget.style.boxShadow = '0 8px 24px hsl(190 100% 42% / 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'hsl(195 100% 12%)';
                  e.currentTarget.style.boxShadow = '';
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="mb-2 flex items-center gap-3">
                      <h3 className="text-xl font-bold" style={{ color: 'hsl(194 100% 88%)' }}>
                        {job.company}
                      </h3>
                    </div>

                    <h4 className="mb-3 text-lg font-semibold" style={{ color: 'hsl(190 100% 55%)' }}>
                      {job.title}
                    </h4>

                    <div className="mb-4 flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-2" style={{ color: 'hsl(194 100% 88%)' }}>
                        <span className="text-lg">💰</span>
                        <span className="font-semibold">{job.salary}</span>
                      </span>
                      <span style={{ color: 'hsl(194 65% 62% / 0.4)' }}>•</span>
                      <span className="flex items-center gap-2" style={{ color: 'hsl(194 100% 88%)' }}>
                        <span className="text-lg">📊</span>
                        <span className="font-medium">{job.experience}</span>
                      </span>
                    </div>

                    <div className="mb-4 flex flex-wrap items-center gap-2.5">
                      <span
                        className="flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-xs font-medium"
                        style={{
                          backgroundColor: 'hsl(193 100% 15%)',
                          color: 'hsl(194 65% 62%)',
                          borderColor: 'hsl(195 100% 12%)',
                        }}
                      >
                        <span>📍</span>
                        {job.location}
                      </span>

                      <span
                        className="rounded-lg border px-3.5 py-1.5 text-xs font-semibold"
                        style={{
                          background: 'linear-gradient(135deg, hsl(162 100% 25%) 0%, hsl(162 100% 30%) 100%)',
                          color: 'hsl(162 100% 82%)',
                          borderColor: 'hsl(162 100% 22% / 0.5)',
                        }}
                      >
                        {job.visa}
                      </span>

                      <span
                        className="flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-xs font-medium"
                        style={{
                          backgroundColor: statusColors.bg,
                          color: statusColors.text,
                          borderColor: statusColors.border,
                        }}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: getStatusDotColor(job.status) }}
                        ></span>
                        {job.status}
                      </span>
                    </div>

                    <p className="text-sm leading-relaxed" style={{ color: 'hsl(194 65% 62%)' }}>
                      {job.description}
                    </p>
                  </div>

                  <div className="ml-8 flex shrink-0 flex-col items-end gap-3">
                    {job.status !== 'Saved' ? (
                      <>
                        <div className="group relative">
                          <button
                            className={`flex min-w-[160px] items-center justify-between gap-2.5 rounded-lg border px-5 py-2.5 text-sm font-medium [box-shadow:0_3px_10px_hsl(190_100%_42%_/_0.2)] hover:[box-shadow:0_4px_14px_hsl(190_100%_42%_/_0.24)] ${primaryButtonClass}`}
                            style={{
                              background: 'linear-gradient(135deg, hsl(193 100% 18%) 0%, hsl(193 100% 22%) 100%)',
                              color: 'hsl(190 100% 60%)',
                              borderColor: 'hsl(190 100% 30%)',
                            }}
                          >
                            <span>{job.status}</span>
                            <svg
                              className="h-4 w-4 transition-transform duration-200 group-hover:rotate-180"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          <div
                            className="absolute right-0 top-full z-10 mt-2 w-48 overflow-hidden rounded-xl border shadow-2xl invisible opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100"
                            style={{ backgroundColor: 'hsl(198 100% 5%)', borderColor: 'hsl(195 100% 12%)' }}
                          >
                            {STATUSES.filter((s) => s !== 'All' && s !== job.status).map((status) => (
                              <button
                                key={status}
                                onClick={() => changeJobStatus(job.id, status)}
                                className={`block w-full text-left px-4 py-3 text-sm first:rounded-t-xl last:rounded-b-xl hover:bg-[hsl(193_100%_14%)] hover:text-[hsl(190_100%_68%)] ${secondaryButtonClass}`}
                                style={{ color: 'hsl(194 65% 62%)' }}
                              >
                                {status}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          className={`flex items-center gap-2 rounded-lg border px-6 py-2.5 text-sm font-semibold hover:bg-[hsl(193_100%_11%)] hover:text-[hsl(190_100%_68%)] hover:border-[hsl(190_100%_28%)] hover:[box-shadow:0_2px_10px_hsl(190_100%_42%_/_0.14)] ${secondaryButtonClass}`}
                          style={{
                            borderColor: 'hsl(195 100% 12%)',
                            color: 'hsl(194 65% 62%)',
                            backgroundColor: 'transparent',
                          }}
                        >
                          <span>Visit</span>
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <button
                        className={`flex items-center gap-2.5 rounded-xl px-7 py-3 text-sm font-bold [box-shadow:0_4px_16px_hsl(190_100%_42%_/_0.4)] hover:[box-shadow:0_6px_20px_hsl(190_100%_42%_/_0.48)] ${primaryButtonClass}`}
                        style={{
                          background: 'linear-gradient(135deg, hsl(190 100% 42%) 0%, hsl(205 100% 48%) 100%)',
                          color: 'hsl(194 100% 88%)',
                        }}
                      >
                        <span>Apply Now</span>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <NavigationBubbles current={1} />
    </div>
  );
}
