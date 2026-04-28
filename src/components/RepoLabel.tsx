const shortRepo = (r: string) => r.split('/').pop() ?? r;

/**
 * Renders a repo identifier responsively: the short name on mobile
 * (e.g. `amethyst`) and the full `owner/name` on desktop. Returns a
 * fragment so the caller controls truncation/styling.
 */
export function RepoLabel({ repo }: { repo: string }) {
  return (
    <>
      <span className="sm:hidden">{shortRepo(repo)}</span>
      <span className="hidden sm:inline">{repo}</span>
    </>
  );
}
