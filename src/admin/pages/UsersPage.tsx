import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { DataTable, type Column } from '../components/DataTable';
import { listUsers } from '../services/users';
import type { Profile } from '../../types/database';

interface UserRow extends Profile {
  plan_name?: string;
}

export function UsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const columns: Column<UserRow>[] = [
    { key: 'email', header: 'Email', sortable: true, width: '30%' },
    {
      key: 'display_name',
      header: 'Name',
      sortable: true,
      width: '20%',
      render: (row) => (row as UserRow).display_name ?? '—',
    },
    {
      key: 'role',
      header: 'Role',
      width: '10%',
      render: (row) => {
        const r = (row as UserRow).role;
        const label = r?.replace('_', ' ') ?? 'user';
        return <span className="capitalize">{label}</span>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: '12%',
      render: (row) => {
        const r = row as UserRow;
        if (r.banned_at) return <span className="text-red-400 font-medium">Banned</span>;
        if (r.suspended_at) return <span className="text-amber-400 font-medium">Suspended</span>;
        if (r.deleted_at) return <span className="text-gray-500">Deleted</span>;
        return <span className="text-emerald-400 font-medium">Active</span>;
      },
    },
    {
      key: 'created_at',
      header: 'Joined',
      sortable: true,
      width: '15%',
      render: (row) => new Date((row as UserRow).created_at).toLocaleDateString(),
    },
  ];

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listUsers({ page, search, status: statusFilter });
      setUsers(result.users as UserRow[]);
      setTotal(result.total);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRowClick = (row: UserRow) => {
    navigate(`/ops/users/${row.id}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
          <option value="suspended">Suspended</option>
        </select>
        <p className="text-sm text-gray-500">{total} user{total !== 1 ? 's' : ''}</p>
      </div>

      <DataTable<UserRow>
        columns={columns}
        data={users}
        loading={loading}
        emptyMessage="No users found"
        pageSize={20}
        onRowClick={handleRowClick}
        keyExtractor={(row) => row.id}
      />
    </div>
  );
}
