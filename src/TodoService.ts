import * as crypto from 'crypto'
import { Resolver } from '@ts-app/graphql'

const uuid = () => crypto.randomBytes(16).toString('hex')

export type Todo = {
  id: string
  title: string
  completed: boolean
  createdAt: Date
}

export class TodoService {
  _todos: {
    [key: string]: Todo
  } = {}

  @Resolver()
  async todos (): Promise<Todo[]> {
    return Object.keys(this._todos).map(id => this._todos[ id ])
  }

  @Resolver({ type: 'mutation', paramNames: [ 'title' ] })
  createTodo (title: string) {
    const id = uuid()
    this._todos[ id ] = {
      id, title,
      completed: false,
      createdAt: new Date()
    }
  }

  @Resolver({ type: 'mutation' })
  updateTodo ({ id, title }: { id: string, title: string }) {
    const todo = this._todos[ id ]
    if (!todo) {
      return { error: `Todo [${id}] not found` }
    }

    todo.title = title
  }

  @Resolver({ type: 'mutation', paramNames: [ 'id' ] })
  deleteTodo (id: string) {
    delete this._todos[ id ]
  }

  @Resolver({ type: 'mutation' })
  markCompleted ({ id, completed }: { id: string, completed: boolean }) {
    console.log(completed)
    const todo = this._todos[ id ]
    if (!todo) {
      return { error: `Todo [${id}] not found` }
    }

    todo.completed = completed
  }

  @Resolver({ type: 'mutation' })
  deleteCompleted () {
    throw new Error('Not implemented!')
  }
}
