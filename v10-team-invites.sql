-- Legacy Hub V10 team invite RPC migration
-- Already applied to the connected Supabase project.

create or replace function public.create_team_invite(p_team_id uuid, p_max_uses integer default 20, p_valid_days integer default 14)
returns table(token text, team_name text, expires_at timestamptz, max_uses integer, use_count integer, active boolean)
language plpgsql security definer set search_path=public
as $$
declare v_network uuid; v_team_name text; v_token text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select network_id,name into v_network,v_team_name from public.teams where id=p_team_id;
  if v_network is null then raise exception 'Team not found'; end if;
  if not (public.is_network_admin() or (public.is_team_manager() and p_team_id=public.current_team_id())) then
    raise exception 'You do not have permission to create an invite for this team';
  end if;
  if p_max_uses < 1 or p_max_uses > 500 then raise exception 'max uses must be between 1 and 500'; end if;
  if p_valid_days < 1 or p_valid_days > 90 then raise exception 'valid days must be between 1 and 90'; end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.team_invites(network_id,team_id,created_by,token,expires_at,max_uses,use_count,active)
  values(v_network,p_team_id,auth.uid(),v_token,now()+(p_valid_days||' days')::interval,p_max_uses,0,true);
  return query select v_token,v_team_name,now()+(p_valid_days||' days')::interval,p_max_uses,0,true;
end$$;

create or replace function public.resolve_team_invite(p_token text)
returns table(team_id uuid, team_name text, short_name text, expires_at timestamptz)
language sql security definer set search_path=public
as $$
  select i.team_id,t.name,t.short_name,i.expires_at
  from public.team_invites i join public.teams t on t.id=i.team_id
  where i.token=p_token and i.active and i.expires_at>now() and i.use_count<i.max_uses
  limit 1
$$;

grant execute on function public.resolve_team_invite(text) to anon, authenticated;
grant execute on function public.create_team_invite(uuid,integer,integer) to authenticated;

create or replace function public.list_team_invites()
returns table(id uuid, team_id uuid, team_name text, token text, expires_at timestamptz, max_uses integer, use_count integer, active boolean, created_at timestamptz)
language sql security definer set search_path=public
as $$
  select i.id,i.team_id,t.name,i.token,i.expires_at,i.max_uses,i.use_count,i.active,i.created_at
  from public.team_invites i join public.teams t on t.id=i.team_id
  where i.network_id=public.current_network_id()
    and (public.is_network_admin() or (public.is_team_manager() and i.team_id=public.current_team_id()))
  order by i.created_at desc
  limit 50
$$;
grant execute on function public.list_team_invites() to authenticated;

create or replace function public.revoke_team_invite(p_invite_id uuid)
returns boolean
language plpgsql security definer set search_path=public
as $$
declare v_team uuid;
begin
  select team_id into v_team from public.team_invites where id=p_invite_id;
  if v_team is null then return false; end if;
  if not (public.is_network_admin() or (public.is_team_manager() and v_team=public.current_team_id())) then raise exception 'Not permitted'; end if;
  update public.team_invites set active=false where id=p_invite_id;
  return true;
end$$;
grant execute on function public.revoke_team_invite(uuid) to authenticated;
