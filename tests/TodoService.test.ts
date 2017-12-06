import { TodoService } from '../src/TodoService'

describe('TodoService', () => {
  test('todos', async () => {
    const todo = new TodoService()
    const message = await todo.todos()
    expect(message).toMatchSnapshot()
  })
})
