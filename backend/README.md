# NaviPro Backend

A robust backend service for the NaviPro navigation application, providing route management, user authentication, and analytics.

## Features

- User authentication and authorization
- Route creation and management
- Real-time traffic data integration
- Route sharing and collaboration
- Analytics and reporting
- Offline support
- API key management

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- Redis (v6 or higher, optional for caching)
- OpenRouteService API key

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/navipro.git
cd navipro/backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the backend directory with the following variables:
```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/navipro
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d
OPENROUTE_API_KEY=your_openroute_api_key
```

4. Start the development server:
```bash
npm run dev
```

## API Documentation

### Authentication

#### POST /api/auth/register
Register a new user.

Request body:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

#### POST /api/auth/login
Login with existing credentials.

Request body:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### Routes

#### POST /api/routes
Create a new route.

Request body:
```json
{
  "name": "Work Route",
  "startLocation": {
    "name": "Home",
    "coordinates": [longitude, latitude]
  },
  "endLocation": {
    "name": "Office",
    "coordinates": [longitude, latitude]
  },
  "preferences": {
    "profile": "driving-car",
    "avoidHighways": false,
    "avoidTolls": true
  }
}
```

#### GET /api/routes
Get all routes for the authenticated user.

#### GET /api/routes/:id
Get a specific route by ID.

#### PUT /api/routes/:id
Update a route.

#### DELETE /api/routes/:id
Delete a route.

### Analytics

#### GET /api/analytics/overall
Get overall analytics (admin only).

#### GET /api/analytics/user
Get user-specific analytics.

#### GET /api/analytics/route/:id
Get analytics for a specific route.

## Error Handling

The API uses standard HTTP status codes and returns error messages in the following format:

```json
{
  "error": "Error message description"
}
```

Common status codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

## Security

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting
- CORS protection
- Helmet security headers
- Input validation

## Development

### Scripts

- `npm run dev`: Start development server with hot reload
- `npm start`: Start production server
- `npm test`: Run tests
- `npm run lint`: Run ESLint
- `npm run build`: Build for production

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
```

## Deployment

1. Set up environment variables for production
2. Build the application:
```bash
npm run build
```
3. Start the production server:
```bash
npm start
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 