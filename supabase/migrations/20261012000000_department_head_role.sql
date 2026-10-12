-- Allow the department head role on memberships.
alter table public.members drop constraint if exists members_role_check;
alter table public.members add constraint members_role_check check (role in ('executive','finance','account_owner','department_head','admin'));
