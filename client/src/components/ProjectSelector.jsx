import { useState, useEffect } from 'react';
import { fetchProjects } from '../api/client';

export default function ProjectSelector({ value, onChange }) {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    fetchProjects().then(setProjects).catch(console.error);
  }, []);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <option value="all">전체 프로젝트</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id} title={p.path}>
          {p.label} ({p.sessionCount})
        </option>
      ))}
    </select>
  );
}
