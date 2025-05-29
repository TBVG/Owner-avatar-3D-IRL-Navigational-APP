# 3D Navigation App

A 3D navigation application built with Cesium.js and OpenRouteService.

## Setup

1. Clone the repository:
```bash
git clone <your-repo-url>
cd <your-repo-name>
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory and add your API keys:
```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your API keys
```

Required API keys:
- Cesium Ion access token: Get it from [https://ion.cesium.com/tokens](https://ion.cesium.com/tokens)
- OpenRouteService API key: Get it from [https://openrouteservice.org/](https://openrouteservice.org/)

4. Start the development server:
```bash
npm run dev
```

## Features

- 3D navigation with turn-by-turn directions
- Real-time location tracking
- Multiple routing options (fastest/shortest)
- Traffic information
- 3D buildings
- Points of interest
- Dark mode support

## Environment Variables

The following environment variables are required:

- `VITE_CESIUM_ACCESS_TOKEN`: Your Cesium Ion access token
- `VITE_OPENROUTE_API_KEY`: Your OpenRouteService API key

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 