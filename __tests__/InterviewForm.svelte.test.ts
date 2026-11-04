// Declared before the imports: `.svelte.test.ts` files are compiled with no
// jest-hoist step, so a mock placed after them would register too late.
jest.mock('#lib/client/firebase.js', () => {
  const { writable } = require('svelte/store')
  return { user: writable(undefined), auth: {}, db: {}, storage: {} }
})

import { flushSync, mount, unmount } from 'svelte'
import { fireEvent, waitFor, within } from '@testing-library/dom'
import { user as mockUserStore } from '#lib/client/firebase.js'
import InterviewForm from '#lib/components/forms/InterviewForm.svelte'
import {
  interviewService,
  type InterviewFetchResult,
} from '#lib/services/interviewService.js'

const DAY = 24 * 60 * 60 * 1000

// Two days ahead at 3:00 PM local: a row of the grid, bookable.
function soon(days = 2, hour = 15) {
  const date = new Date(Date.now() + days * DAY)
  date.setHours(hour, 0, 0, 0)
  return date
}

const interviewWindow = {
  opens: new Date(Date.now() - DAY),
  closes: new Date(Date.now() + 30 * DAY),
}

const data = (
  overrides: Partial<InterviewFetchResult> = {},
): InterviewFetchResult => ({
  scheduledInterview: null,
  availableTimes: [soon()],
  interviewWindow,
  availability: null,
  ...overrides,
})

const keyOf = (date: Date) =>
  `${date.getDay()}:${date.getHours() * 60 + date.getMinutes()}`

describe('InterviewForm', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    ;(mockUserStore as any).set(undefined)
    jest.spyOn(interviewService, 'fetchInterviewData').mockResolvedValue(data())
    jest.spyOn(interviewService, 'bookInterview').mockResolvedValue({
      id: 'slot-1',
      date: 'Thursday',
      at: soon(),
      interviewerName: 'Jane',
      meetingLink: 'https://zoom.us/j/1',
      interviewSlotStatus: 'pending',
    })
    jest.spyOn(interviewService, 'cancelInterview').mockResolvedValue({
      emailSent: true,
    })
    jest
      .spyOn(interviewService, 'saveAvailability')
      .mockImplementation(async (times) => times)
    jest.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    document.body.removeChild(container)
    jest.restoreAllMocks()
  })

  async function mountSignedIn() {
    const app = mount(InterviewForm, { target: container })
    flushSync()
    ;(mockUserStore as any).set({ object: { uid: 'uid-1' }, profile: {} })
    await waitFor(() => {
      expect(interviewService.fetchInterviewData).toHaveBeenCalled()
    })
    // Loading's spinner fades out, which jsdom never finishes; wait for the
    // content instead.
    await waitFor(() => {
      expect(container.textContent).toMatch(/local time/)
    })
    flushSync()
    return app
  }

  const cell = (key: string) =>
    // eslint-disable-next-line testing-library/no-node-access -- cells are addressed by their grid key
    container.querySelector<HTMLElement>(`[data-cell="${key}"]`)!

  it('books the open time chosen on the calendar, naming no interviewer', async () => {
    const app = await mountSignedIn()

    expect(
      within(container).getByText(/Times shown in your local time/),
    ).toBeInTheDocument()
    expect(cell(keyOf(soon()))).toHaveTextContent('Open')
    expect(container.textContent).not.toContain('Jane')

    fireEvent.click(cell(keyOf(soon())))
    flushSync()
    fireEvent.click(within(container).getByText(/^Book /))
    await waitFor(() => {
      expect(interviewService.bookInterview).toHaveBeenCalledWith(soon(), {
        reschedule: false,
      })
    })
    await waitFor(() => {
      expect(
        within(container).getByText(/Your interview will be on Thursday with/),
      ).toBeInTheDocument()
    })

    unmount(app)
  })

  it('saves the times painted when none of the open ones work', async () => {
    const app = await mountSignedIn()

    fireEvent.click(within(container).getByText('None of these work for me'))
    flushSync()
    const free = soon(2, 18)
    // A keyboard toggle: a click carrying no pointer.
    fireEvent.click(cell(keyOf(free)), { detail: 0 })
    fireEvent.click(cell(keyOf(soon())), { detail: 0 })
    flushSync()

    expect(within(container).getByTestId('painted-count')).toHaveTextContent(
      '2 times painted',
    )
    // One of them is open already: book it instead.
    expect(within(container).getByTestId('offered-nudge')).toBeInTheDocument()

    fireEvent.click(within(container).getByText('Save my availability'))
    await waitFor(() => {
      expect(interviewService.saveAvailability).toHaveBeenCalled()
    })
    const [times] = (interviewService.saveAvailability as jest.Mock).mock
      .calls[0]
    expect(times.map((time: Date) => time.getTime()).sort()).toEqual(
      [soon().getTime(), free.getTime()].sort(),
    )

    unmount(app)
  })

  it('scrolls back to the enclosing card once painting starts, only if its heading is out of view', async () => {
    // The dashboard's Interview card, scrolled past.
    const card = document.createElement('div')
    card.setAttribute('data-scroll-anchor', '')
    document.body.replaceChild(card, container)
    card.appendChild(container)
    const scrollIntoView = jest.fn()
    card.scrollIntoView = scrollIntoView
    const top = jest
      .spyOn(card, 'getBoundingClientRect')
      .mockReturnValue({ top: -400 } as DOMRect)
    const app = await mountSignedIn()

    fireEvent.click(within(container).getByText('None of these work for me'))
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      })
    })
    expect(
      within(container).getByText('When are you free?'),
    ).toBeInTheDocument()

    // Already in view: left where it is.
    fireEvent.click(within(container).getByText('Back to open times'))
    flushSync()
    top.mockReturnValue({ top: 200 } as DOMRect)
    scrollIntoView.mockClear()
    fireEvent.click(within(container).getByText('None of these work for me'))
    await Promise.resolve()
    flushSync()
    expect(scrollIntoView).not.toHaveBeenCalled()

    unmount(app)
    document.body.replaceChild(container, card)
  })

  it('shows what was painted before, ready to edit', async () => {
    const free = soon(3, 10)
    ;(interviewService.fetchInterviewData as jest.Mock).mockResolvedValue(
      data({
        availableTimes: [],
        availability: { times: [free], updated: new Date() },
      }),
    )
    const app = await mountSignedIn()

    expect(
      within(container).getByTestId('saved-availability'),
    ).toHaveTextContent('free at 1 time')
    fireEvent.click(within(container).getByText('Edit when I’m free'))
    flushSync()
    expect(cell(keyOf(free)).getAttribute('aria-pressed')).toBe('true')

    unmount(app)
  })

  describe('with an interview booked', () => {
    const booked = {
      id: 'slot-1',
      date: 'Thursday',
      at: soon(1),
      interviewerName: 'Jane',
      meetingLink: 'https://zoom.us/j/1',
      interviewSlotStatus: 'pending',
    }

    beforeEach(() => {
      ;(interviewService.fetchInterviewData as jest.Mock).mockResolvedValue(
        data({ scheduledInterview: booked }),
      )
    })

    it('cancels it once confirmed', async () => {
      jest.spyOn(window, 'confirm').mockReturnValue(true)
      const app = await mountSignedIn()

      fireEvent.click(within(container).getByText('Cancel my interview'))
      await waitFor(() => {
        expect(interviewService.cancelInterview).toHaveBeenCalled()
      })

      unmount(app)
    })

    it('moves it to a new time, keeping it until the new one is confirmed', async () => {
      const app = await mountSignedIn()

      fireEvent.click(within(container).getByText('Reschedule'))
      flushSync()
      expect(
        within(container).getByText('Choose a new interview time'),
      ).toBeInTheDocument()
      fireEvent.click(cell(keyOf(soon())))
      flushSync()
      fireEvent.click(within(container).getByText(/^Move my interview to/))
      await waitFor(() => {
        expect(interviewService.bookInterview).toHaveBeenCalledWith(soon(), {
          reschedule: true,
        })
      })

      unmount(app)
    })
  })
})
