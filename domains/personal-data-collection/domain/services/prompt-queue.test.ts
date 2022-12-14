import { assert } from '@test/assert'
import Answer from '../entities/answer'
import answerRepositoryDatabase from '../../infrastructure/answer-prisma'
import {
  addDay,
  calculateQuery,
  filterIfCurrentDay,
  keepUnlessPromptAnswered,
  PromptQueue,
  toDayList,
  toLocalTime,
  toStartOfDay,
} from './prompt-queue'
import { describe } from 'vitest'
import prisma from '../../infrastructure/db.server'
import Prompt from '../value-objects/prompt'
import recurringQuestionRepositoryDatabase from '../../infrastructure/recurring-question-prisma'

describe('promptQueue()', async () => {
  await prisma.answer.deleteMany()
  await prisma.recurringQuestion.deleteMany()

  const promptQueue = PromptQueue(recurringQuestionRepositoryDatabase())(answerRepositoryDatabase())

  const startDate = new Date('2022-10-20T01:00:00.000Z')
  const startDateLocal = new Date('2022-10-19T20:00:00.000Z')
  const startOfDayInLocalTime = new Date('2022-10-19T05:00:00.000Z')

  const firstDayPrompt: Prompt = {
    questionId: '1',
    question: 'Did you study 2 hours today?',
    timestamp: startOfDayInLocalTime,
  }

  const secondDayPrompt: Prompt = {
    questionId: '1',
    question: 'Did you study 2 hours today?',
    timestamp: addDay(startOfDayInLocalTime),
  }

  const firstDayAnswer: Answer = {
    id: '1',
    questionId: '1',
    timestamp: new Date(startOfDayInLocalTime),
    response: true,
  }

  await promptQueue.createRecurringQuestion({
    id: '1',
    question: 'Did you study 2 hours today?',
    phases: [
      {
        timestamp: startDate,
        utcOffsetInMinutes: 5 * 60,
      },
    ],
  })

  assert({
    given: 'a recurring question and a query in two days local time',
    should: 'return two prompts, one for each day except the current day',
    actual: await promptQueue.query(addHours(28, startDateLocal)),
    expected: [firstDayPrompt, secondDayPrompt],
  })

  await promptQueue.createAnswer(firstDayAnswer)

  assert({
    given: 'one prompt answered',
    should: 'return one answer',
    actual: await promptQueue.getAnswers(),
    expected: [firstDayAnswer],
  })

  assert({
    given: 'a prompt answered',
    should: 'not show the prompt again',
    actual: await promptQueue.query(addHours(28, startDateLocal)),
    expected: [secondDayPrompt],
  })
})

describe('calculateQuery()', () => {
  const startTimeUTC = new Date('2022-10-22T01:00:00.000Z')
  const queryTimeLocal = new Date('2022-10-22T00:00:00.000Z')

  assert({
    given: 'a recurring quesion created at 20:00 local time, follow by a query at 00:00 local time',
    should: 'return one prompt',
    actual: calculateQuery(
      [
        {
          id: '1',
          question: 'Have you studied today?',
          phases: [
            {
              timestamp: startTimeUTC,
              utcOffsetInMinutes: 5 * 60,
            },
          ],
        },
      ],
      [],
      queryTimeLocal
    ),
    expected: [
      {
        questionId: '1',
        question: 'Have you studied today?',
        timestamp: new Date('2022-10-21T05:00:00.000Z'),
      },
    ],
  })
})

describe('keepUnlessPromptAnswered()', () => {
  const answer: Answer = {
    id: '1',
    questionId: '1',
    response: true,
    timestamp: new Date('2022-10-19T10:00:00.000Z'),
  }

  const prompt: Prompt = {
    questionId: '1',
    question: 'Did you study 2 hours today?',
    timestamp: new Date('2022-10-19T15:00:00.000Z'),
  }

  assert({
    given: 'an answer and a prompt at different times',
    should: 'not filter prompt',
    actual: keepUnlessPromptAnswered([answer])([prompt]),
    expected: [prompt],
  })

  const answerAtSameTime: Answer = {
    id: '1',
    questionId: '1',
    response: true,
    timestamp: new Date('2022-10-19T15:00:00.000Z'),
  }

  assert({
    given: 'an answer and a prompt at the same time',
    should: 'filter prompt',
    actual: keepUnlessPromptAnswered([answerAtSameTime])([prompt]),
    expected: [],
  })
})

describe('filterIfCurrentDay()', () => {
  const firstDayPrompt: Prompt = {
    questionId: '1',
    question: 'Did you study 2 hours today?',
    timestamp: new Date('2022-10-19T05:00:00.000Z'),
  }

  const secondDayPrompt: Prompt = {
    questionId: '1',
    question: 'Did you study 2 hours today?',
    timestamp: new Date('2022-10-20T05:00:00.000Z'),
  }

  assert({
    given: 'a query on the 21st and prompts on the 19th and 20th',
    should: 'return the prompts on the 19th and 20th',
    actual: filterIfCurrentDay(new Date('2022-10-21T00:00:00.000Z'))([firstDayPrompt, secondDayPrompt]),
    expected: [firstDayPrompt, secondDayPrompt],
  })
})

describe('toDayList()', () => {
  const startDate = new Date(2022, 9, 22, 0, 0, 0, 0)
  const endDate = new Date(2022, 9, 24, 0, 0, 0, 0)

  assert({
    given: 'a date and another date 2 days after',
    should: 'return a list of 3 dates',
    actual: toDayList(startDate, endDate),
    expected: [startDate, addDay(startDate), endDate],
  })

  assert({
    given: 'a date and another date 5 hours after after',
    should: 'return one day',
    actual: toDayList(startDate, new Date(2022, 9, 22, 5, 0, 0, 0)),
    expected: [startDate],
  })

  assert({
    given: 'a date and another date 25 hours after after',
    should: 'return two days, second day exactly 24 hours after first day',
    actual: toDayList(startDate, new Date(2022, 9, 23, 1, 0, 0, 0)),
    expected: [startDate, addDay(startDate)],
  })
})

describe('toStartOfDay()', () => {
  assert({
    given: 'a date at 8PM',
    should: 'return a date at 12AM the same day',
    actual: toStartOfDay(new Date('2022-10-19T20:01:01.500Z')),
    expected: new Date('2022-10-19T00:00:00.000Z'),
  })
})

describe('toLocalTime()', () => {
  assert({
    given: 'a date at 1AM and a UTC offset of -5 hours (EST)',
    should: 'return a date at 8PM the previous day',
    actual: toLocalTime({
      timestamp: new Date('2022-10-20T01:00:00.000Z'),
      utcOffsetInMinutes: 5 * 60,
    }),
    expected: new Date('2022-10-19T20:00:00.000Z'),
  })

  assert({
    given: 'a date at 8PM and a UTC offset of 2 hours (Bucharest)',
    should: 'return a date at 10PM the same day',
    actual: toLocalTime({
      timestamp: new Date('2022-10-20T20:00:00.000Z'),
      utcOffsetInMinutes: -2 * 60,
    }),
    expected: new Date('2022-10-20T22:00:00.000Z'),
  })
})

const addHours = (hours: number, date: Date) => {
  const newDate = new Date(date)
  newDate.setHours(newDate.getHours() + hours)
  return newDate
}
