import { TodoService } from '../src/TodoService'

describe('TodoService', () => {
  test('todos() is empty', async () => {
    const todo = new TodoService()
    const message = await todo.todos()
    expect(message).toEqual([])
  })

  test('create() 1 todo', async () => {
    const todo = new TodoService()
    todo.createTodo('bob')
    todo.createTodo('candy')
    const title = (await todo.todos()).map(todo => todo.title)
    expect(title).toEqual([ 'bob', 'candy' ])
  })
})
