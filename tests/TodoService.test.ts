import { serveSchema } from '@ts-app/graphql'
import { mergeSchemaDefinitions } from '@ts-app/graphql'
import { MongoService } from '@ts-app/mongo'
import { Server } from 'http'
import { ResolverService } from '@ts-app/graphql'
import { ApolloFetch, createApolloFetch } from 'apollo-fetch'
import { makeExecutableSchema } from 'graphql-tools'
import gql from 'graphql-tag'
import { SecurityService } from '@ts-app/security'
import { TodoService } from '../src/TodoService'
import { todoSchemaDefinition } from '../src/todoSchemaDefinition'

describe('TodoService', () => {
  const mockResolverParam = {
    // only mock in data needed by tests
    user: {
      id: 'fake-user-id',
      profile: {
        name: 'fakeUser'
      }
    }
  } as any

  test('todos() is empty', async () => {
    const todo = new TodoService()
    const message = await todo.todos(null, mockResolverParam)
    expect(message).toEqual({ docs: [] })
  })

  test('create() 1 todo', async () => {
    const todo = new TodoService()
    let create = await todo.createTodo('bob', mockResolverParam)
    expect(create.error).toBeFalsy()
    create = await todo.createTodo('candy', mockResolverParam)
    expect(create.error).toBeFalsy()
    const title = (await todo.todos(null, mockResolverParam)).docs!.map(todo => todo.title)
    expect(title).toEqual([ 'bob', 'candy' ])
  })

  // TODO: move this test suite to ts-app/security
  describe('Execute GraphQL queries', () => {
    const localUrl = 'mongodb://localhost:27017'
    const resolverService = ResolverService.getInstance()
    let mongoService: MongoService
    let securityService: SecurityService
    let server: Server
    let fetch: ApolloFetch

    beforeAll(async () => {
      mongoService = new MongoService(localUrl)
      const todo = todoSchemaDefinition({ mongoService })
      securityService = resolverService.getService<SecurityService>('SecurityService')!
      const merged = mergeSchemaDefinitions([ todo ])
      const schema = makeExecutableSchema(merged)
      server = await serveSchema({ schema })

      fetch = createApolloFetch({ uri: 'http://localhost:3000/graphql' })
    })

    afterAll(async () => {
      // shutdown graphql
      await new Promise(resolve => server.close(resolve))
      resolverService.resetServices()

      // shutdown services
      const db = await mongoService.db()
      await db.close()
    })

    beforeEach(async () => {
      try {
        await mongoService.dropCollection('users')
        await mongoService.dropCollection('roles')
      } catch {
        // it's ok
      }
    })

    afterEach(() => {
      resolverService.setLogger({ error: console.error })
    })

    const hideResolverServiceLog = () => {
      resolverService.setLogger({
        error: () => {
          // do nothing
        }
      })
    }

    const createFetchAs = (accessToken: string) => {
      const fetch = createApolloFetch({ uri: 'http://localhost:3000/graphql' })
      fetch.use(({ request, options }, next) => {
        if (!options.headers) {
          options.headers = {}
        }
        const headers: any = options.headers
        headers[ 'Authorization' ] = 'Bearer ' + accessToken
        next()
      })
      return fetch
    }

    const gqlLogin = gql`mutation login($email: String!, $password: String!) {
        loginWithEmailPassword(email: $email, password: $password) {
            error accessToken refreshToken userId
        }
    }`

    const createFetchAsWithEmailAndPassword = async (email: string, password: string) => {
      let result = await fetch({
        query: gqlLogin,
        variables: { email, password }
      })

      expect(result.data.loginWithEmailPassword.error).toBeFalsy()
      const { accessToken } = result.data.loginWithEmailPassword
      expect(accessToken.length).toBeGreaterThan(10)

      // create a fetch object with specified access token
      return {
        fetch: createFetchAs(accessToken),
        userId: result.data.loginWithEmailPassword.userId
      }
    }

    describe('SecurityService', () => {
      const gqlSignup = gql`mutation signUp($email: String!, $password: String!) {
          signUp(email: $email, password: $password) {
              error
              user {
                  id
                  emails {
                      email
                      verified
                  }
                  profile {
                      name
                      email
                  }
              }
          }
      }`

      const gqlUsers = gql`query {
          users {
              error
              cursor
              docs {
                  id
                  createdAt
                  profile {
                      email
                      name
                  }
              }
          }
      }`

      test('cannot signUp() with invalid email', async () => {
        const result = await fetch({
          query: gqlSignup,
          variables: { email: 'bob-is-not-email', password: '...' }
        })
        expect(result.data.signUp.error).toBe('Invalid email')
        expect(result.data).toMatchSnapshot()
      })

      test('can signUp(). loginWithEmailPassword()', async () => {
        // --- sign up
        let result = await fetch({
          query: gqlSignup,
          variables: { email: 'bob@test.local', password: 'bob' }
        })
        expect(result.data.signUp.error).toBeFalsy()
        expect(result.data.signUp.user.profile.email).toBe('bob@test.local')
        const userId = result.data.signUp.user.id
        expect(userId.length).toBe(24)

        // --- login with incorrect password
        result = await fetch({
          query: gqlLogin,
          variables: { email: 'bob@test.local', password: 'bob123' }
        })
        expect(result.data.loginWithEmailPassword.error).toBe('Invalid login attempt')

        // --- successful login
        result = await fetch({
          query: gqlLogin,
          variables: { email: 'bob@test.local', password: 'bob' }
        })
        expect(result.data.loginWithEmailPassword.error).toBeFalsy()
        expect(result.data.loginWithEmailPassword.userId).toBe(userId)
        // access/refresh token string must be > 10 (it's a lot longer but we don't really care for now)
        expect(result.data.loginWithEmailPassword.accessToken.length).toBeGreaterThan(10)
        expect(result.data.loginWithEmailPassword.refreshToken.length).toBeGreaterThan(10)
      })

      test('users() - authorized, unauthenticated and unauthorized access', async () => {
        hideResolverServiceLog()

        // seed users (seeding is slow, so let's test a few scenarios here)
        await securityService.seedUsers()

        // "authorized"
        // login as admin@test.local
        const fetchAsAdmin = await createFetchAsWithEmailAndPassword('admin@test.local', 'testAdmin')
        let result = await fetchAsAdmin.fetch({ query: gqlUsers })
        expect(result.data.users.error).toBeFalsy()
        expect(result.data.users.cursor.length).toBe(24)
        expect(result.data.users.docs.length).toBe(10)

        // "unauthenticated"
        result = await fetch({ query: gqlUsers })
        expect(result.data.users.error).toBe('Unauthenticated access!')

        // "unauthorized"
        result = await fetch({
          query: gqlLogin,
          variables: { email: 'user1@test.local', password: 'testUser' }
        })
        expect(result.data.loginWithEmailPassword.error).toBeFalsy()
        const userAccessToken = result.data.loginWithEmailPassword.accessToken
        expect(userAccessToken.length).toBeGreaterThan(10)
        const fetchAsUser = createFetchAs(userAccessToken)
        result = await fetchAsUser({ query: gqlUsers })
        expect(result.data.users.error).toBe('Unauthorized access!')
      })
    })

    describe('TodoService', () => {
      const queryCreate = gql`mutation create($title: String!) {
          createTodo(title: $title) {
              error id
          }
      }`
      const queryTodos = gql`query {
          todos {
              error
              docs {
                  title completed ownerName
              }
          }
      }`
      const queryUpdate = gql`mutation update($ownerId: String!, $id: String!, $title: String!) {
          updateTodo(id: $id, title: $title, ownerId: $ownerId) {
              error
          }
      }`
      const queryDelete = gql`mutation deleteTodo($ownerId: String!, $id: String!) {
          deleteTodo(ownerId: $ownerId, id: $id) {
              error
          }
      }`
      const queryMarkCompleted = gql`mutation markCompleted($ownerId: String!, $id: String!, $completed: Boolean) {
          markCompleted(ownerId: $ownerId, id: $id, completed: $completed) {
              error
          }
      }`

      test('before login cannot create role', async () => {
        hideResolverServiceLog()

        let result = await fetch({ query: queryCreate, variables: { title: 'first todo' } })
        expect(result.data.createTodo.error).toBe('Unauthenticated access!')
      })

      test('todos(), createTodo(), updateTodo() with authentication and authorization checks', async () => {
        hideResolverServiceLog()

        await securityService.seedUsers()

        // user1 create todo
        const fetchAsUser1 = await createFetchAsWithEmailAndPassword('user1@test.local', 'testUser')
        let result = await fetchAsUser1.fetch({
          query: queryCreate,
          variables: { title: 'first todo by user1' }
        })
        const user1TodoId = result.data.createTodo.id
        expect(result.data.createTodo.error).toBeFalsy()
        expect(user1TodoId.length).toBe(32)

        // user2 create todo
        const fetchAsUser2 = await createFetchAsWithEmailAndPassword('user2@test.local', 'testUser')
        result = await fetchAsUser2.fetch({
          query: queryCreate,
          variables: { title: 'first todo by user2' }
        })
        const user2TodoId = result.data.createTodo.id
        expect(result.data.createTodo.error).toBeFalsy()
        expect(user2TodoId.length).toBe(32)

        // retrieve user1 specific todo
        result = await fetchAsUser1.fetch({ query: queryTodos })
        expect(result.data.todos.error).toBeFalsy()
        expect(result.data.todos.docs).toMatchSnapshot('user1 cannot see user2 todos')

        // retrieve user2 specific todo
        result = await fetchAsUser2.fetch({ query: queryTodos })
        expect(result.data.todos.error).toBeFalsy()
        expect(result.data.todos.docs).toMatchSnapshot('user2 cannot see user1 todos')

        // user1 can update user1Todo
        result = await fetchAsUser1.fetch({
          query: queryUpdate, variables: {
            id: user1TodoId,
            title: 'first todo updated by user1',
            ownerId: fetchAsUser1.userId
          }
        })
        expect(result.data.updateTodo.error).toBeFalsy()

        // user1 cannot update user2Todo (via auth: userIdMatchParam('ownerId'))
        result = await fetchAsUser1.fetch({
          query: queryUpdate, variables: {
            id: user2TodoId,
            title: 'first todo updated by user1',
            ownerId: fetchAsUser2.userId
          }
        })
        expect(result.data.updateTodo.error).toBe('Unauthorized access!')

        // user1 cannot update user2Todo (cannot hack by replacing ownerId)
        result = await fetchAsUser1.fetch({
          query: queryUpdate, variables: {
            id: user2TodoId,
            title: 'first todo updated by user1',
            ownerId: fetchAsUser1.userId
          }
        })
        expect(result.data.updateTodo.error).toBeTruthy()
      })

      test('deleteTodo()', async () => {
        await securityService.seedUsers()

        // user1 create todo
        const fetchAsUser1 = await createFetchAsWithEmailAndPassword('user1@test.local', 'testUser')
        let result = await fetchAsUser1.fetch({
          query: queryCreate,
          variables: { title: 'first todo by user1' }
        })
        const user1TodoId = result.data.createTodo.id
        expect(result.data.createTodo.error).toBeFalsy()
        expect(user1TodoId.length).toBe(32)

        // user1 delete todo1
        result = await fetchAsUser1.fetch({
          query: queryDelete, variables: {
            ownerId: fetchAsUser1.userId,
            id: user1TodoId
          }
        })

        expect(result.data.deleteTodo.error).toBeFalsy()
      })

      test('markCompleted()', async () => {
        await securityService.seedUsers()

        // user1 create todo
        const fetchAsUser1 = await createFetchAsWithEmailAndPassword('user1@test.local', 'testUser')
        let result = await fetchAsUser1.fetch({
          query: queryCreate,
          variables: { title: 'first todo by user1' }
        })
        const user1TodoId = result.data.createTodo.id
        expect(result.data.createTodo.error).toBeFalsy()
        expect(user1TodoId.length).toBe(32)

        // created todo is not completed
        result = await fetchAsUser1.fetch({ query: queryTodos })
        expect(result.data.todos.docs[ 0 ].completed).toBe(false)

        // mark as completed
        result = await fetchAsUser1.fetch({
          query: queryMarkCompleted, variables: {
            ownerId: fetchAsUser1.userId, id: user1TodoId, completed: true
          }
        })
        expect(result.data.markCompleted.error).toBeFalsy()

        // todo is completed
        result = await fetchAsUser1.fetch({ query: queryTodos })
        expect(result.data.todos.docs[ 0 ].completed).toBe(true)

        // mark as not completed
        result = await fetchAsUser1.fetch({
          query: queryMarkCompleted, variables: {
            ownerId: fetchAsUser1.userId, id: user1TodoId, completed: false
          }
        })
        expect(result.data.markCompleted.error).toBeFalsy()

        // todo is not completed
        result = await fetchAsUser1.fetch({ query: queryTodos })
        expect(result.data.todos.docs[ 0 ].completed).toBe(false)
      })

    })
  })
})
