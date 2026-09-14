/** The caveats shown with every judge profile (item 14), in the coordinator's own words. */
export function ProfileCaveats() {
  return (
    <div className="caveats">
      <div className="callout">
        <b>Marking hard is not a fault.</b> Every group’s score is averaged across its judges, so a strict judge is absorbed completely. Severity is context, not a problem.
      </div>
      <ul>
        <li>Three judges on one evening is a small sample, and the panel’s consensus is not the truth.</li>
        <li>A judge who disagrees may be the one paying attention.</li>
      </ul>
    </div>
  );
}
