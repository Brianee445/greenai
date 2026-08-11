-- Public bucket for AI-generated images. Images are written server-side by
-- the generate-image edge function (using the service role key, which
-- bypasses RLS), and read publicly via their returned URL — the same way a
-- user would view any image link. No user ever uploads directly to this
-- bucket, so no INSERT policy for authenticated/anon roles is needed.

insert into storage.buckets (id, name, public)
values ('generated-images', 'generated-images', true)
on conflict (id) do nothing;

create policy "Public read access for generated images"
  on storage.objects for select
  using (bucket_id = 'generated-images');
