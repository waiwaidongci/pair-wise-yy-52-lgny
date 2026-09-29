import { getState } from '~/server/utils/store'

export default defineEventHandler(() => getState())
