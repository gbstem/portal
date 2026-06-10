import raceJson from './race.json'
import gendersJson from './genders.json'
import shirtSizeJson from './shirtSizes.json'
import dietaryRestrictionsJson from './dietaryRestrictions.json'
import errorsJson from './errors.json'
import reasonsJson from './reasons.json'
import fieldsJson from './fields.json'
import frlpJson from './frlp.json'
import gradesJson from './grades.json'
import parentEducationJson from './parentEducation.json'
import timeSlotsJson from './timeSlots.json'
import springCourses from './springCourses.json'
import fallCourses from './fallCourses.json'
import classesPerWeekJson from './classesPerWeek.json'
import daysOfWeekJson from './daysOfWeek.json'
import coriRacesJson from './coriRace.json'
import coriSexesJson from './coriSexes.json'

const coursesJson: Array<{
  name: string
  track: 'cs' | 'math' | 'engineering' | 'science'
}> = []

if (new Date().getMonth() >= 7) {
  coursesJson.push(...(fallCourses as any))
} else {
  coursesJson.push(...(springCourses as any))
}

const csCoursesJson = [
  { name: 'I am not interested in the computer science track.' },
  ...coursesJson.filter((c) => c.track === 'cs').map((c) => ({ name: c.name })),
]
const mathCoursesJson = [
  { name: 'I am not interested in the mathematics track.' },
  ...coursesJson
    .filter((c) => c.track === 'math')
    .map((c) => ({ name: c.name })),
]
const engineeringCoursesJson = [
  { name: 'I am not interested in the engineering track.' },
  ...coursesJson
    .filter((c) => c.track === 'engineering')
    .map((c) => ({ name: c.name })),
]
const scienceCoursesJson = [
  { name: 'I am not interested in the science track.' },
  ...coursesJson
    .filter((c) => c.track === 'science')
    .map((c) => ({ name: c.name })),
]

export {
  raceJson,
  gendersJson,
  shirtSizeJson,
  dietaryRestrictionsJson,
  reasonsJson,
  errorsJson,
  fieldsJson,
  frlpJson,
  csCoursesJson,
  mathCoursesJson,
  scienceCoursesJson,
  engineeringCoursesJson,
  gradesJson,
  parentEducationJson,
  timeSlotsJson,
  coursesJson,
  classesPerWeekJson,
  daysOfWeekJson,
  coriRacesJson,
  coriSexesJson,
}
