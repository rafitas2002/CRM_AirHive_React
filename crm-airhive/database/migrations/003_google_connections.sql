-- Migration: Add google_connections table for OAuth token storage
-- Created: 2026-01-26

-- Create google_connections table
create table if not exists google_connections (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) not null unique,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  scope text not null,
  email text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table google_connections enable row level security;

-- RLS Policies
create policy "Users can view their own google connection"
  on google_connections for select
  using (auth.uid() = user_id);

create policy "Users can insert their own google connection"
  on google_connections for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own google connection"
  on google_connections for update
  using (auth.uid() = user_id);

create policy "Users can delete their own google connection"
  on google_connections for delete
  using (auth.uid() = user_id);

-- Indexes for performance
create index if not exists google_connections_user_id_idx on google_connections(user_id);

-- Function to automatically update updated_at timestamp
create or replace function update_google_connections_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to call the function
create trigger update_google_connections_updated_at
  before update on google_connections
  for each row
  execute function update_google_connections_updated_at();
