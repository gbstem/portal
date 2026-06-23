export function generateCurriculumLink(className: string): string {
  if (className.includes('Mathematics')) {
    const adjustedName = className.replace('Mathematics ', 'math')
    const adjustedCase =
      adjustedName.slice(0, -1).toLowerCase() +
      adjustedName.slice(-1).toUpperCase()
    return `https://curriculum.gbstem.org/math/${adjustedCase}`
  } else if (className.includes('Web Development')) {
    const adjustedName = className.replace('Web Development', 'webdev')
    return `https://curriculum.gbstem.org/cs/${adjustedName}`
  } else if (className.includes('Environmental Science')) {
    const adjustedName = className.replace(
      'Environmental Science',
      'environmental',
    )
    const adjustedCase =
      adjustedName.slice(0, -1).toLowerCase() +
      adjustedName.slice(-1).toUpperCase()
    return `https://curriculum.gbstem.org/science/${adjustedCase}`
  } else {
    let category = 'cs'
    if (className.includes('Physics')) {
      category = 'science'
    } else if (className.includes('Engineering')) {
      category = 'engineering'
    }
    const adjustedName = className.toLowerCase().replace(' ', '')
    const adjustedCase =
      adjustedName.slice(0, -1).toLowerCase() +
      adjustedName.slice(-1).toUpperCase()
    return `https://curriculum.gbstem.org/${category}/${adjustedCase}`
  }
}
