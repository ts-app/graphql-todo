import { Resolver } from '@ts-app/graphql'

export type Todo = {
  id: string
  title: string
  completed: boolean
}

export class TodoService {
  @Resolver()
  async todos (): Promise<Todo[]> {
    return [
      { id: '1', title: 'abc', completed: true },
      { id: '2', title: 'def', completed: false },
      { id: '3', title: 'ghi', completed: false }
    ]
  }
}
