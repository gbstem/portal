import { coursesJson } from '$lib/data'

const CURRICULUM_BASE = 'https://curriculum.gbstem.org'

/**
 * The curriculum page for a class, or `null` when no course matches.
 *
 * Classes store a course *name* (`Scratch 1`, `Web Development`), and the
 * curriculum site addresses courses by *id* (`scratch1A`, `webdevA`). The
 * catalog holds both, so this is a lookup rather than a derivation - which is
 * what the helper this replaced tried to be, munging the name into a URL:
 *
 *     'Web Development A'.replace('Web Development', 'webdev')  // 'webdev A'
 *
 * giving `/cs/webdev A`, with a space, for every web development class.
 *
 * The lookup runs against the current semester's slice of the catalog, and
 * that is the part a string transform could never do: the trailing `A`/`B` on
 * a curriculum id is the half of the year, so the very same class named
 * `Scratch 1` belongs at `/cs/scratch1A` in the fall and `/cs/scratch1B` in
 * the spring. The old helper never saw the semester, so it could not produce
 * either one.
 *
 * `null` means no course of that name is on offer - a class carried over from
 * an earlier semester, or one holding a retired name like `Python II`. Callers
 * hide the button rather than opening a URL the curriculum site would reject
 * with "Class not found".
 */
export function curriculumLink(courseName: string): string | null {
  const course = coursesJson.find(({ name }) => name === courseName)
  if (!course) {
    return null
  }
  // Case matters in the course segment: curriculum's route lowercases the
  // track before looking it up but leaves the course alone, so `/cs/webdevA`
  // resolves where `/cs/webdeva` throws.
  return `${CURRICULUM_BASE}/${course.track}/${course.id}`
}
