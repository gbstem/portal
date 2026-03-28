import raceJson from './race.json'
import gendersJson from './genders.json'
import shirtSizeJson from './shirtSizes.json'
import dietaryRestrictionsJson from './dietaryRestrictions.json'
import errorsJson from './errors.json'
import reasonsJson from './reasons.json'
import fieldsJson from './fields.json'
import frlpJson from './frlp.json'
import csCoursesJson from './csCourses.json'
import mathCoursesJson from './mathCourses.json'
import scienceCoursesJson from './scienceCourses.json'
import engineeringCoursesJson from './engineeringCourses.json'
import gradesJson from './grades.json'
import parentEducationJson from './parentEducation.json'
import timeSlotsJson from './timeSlots.json'
import springCourses from './springCourses.json'
import fallCourses from './fallCourses.json'
import classesPerWeekJson from './classesPerWeek.json'
import daysOfWeekJson from './daysOfWeek.json'
import coriRacesJson from './coriRace.json'
import coriSexesJson from './coriSexes.json'

const coursesJson = []

if (new Date().getMonth() >= 7) {
  coursesJson.push(...fallCourses)
} else {
  coursesJson.push(...springCourses)
}

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
