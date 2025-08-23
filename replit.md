# TripMate - AI-Powered Travel Companion

## Overview

TripMate is a comprehensive travel planning and journaling application that helps users organize trips, track experiences, and access essential travel tools. The application provides AI-powered trip planning, travel journaling with photo support, real-time weather updates, currency conversion, emergency services locator, and offline map capabilities. Built as a full-stack web application, it combines a React frontend with an Express backend and uses PostgreSQL for data persistence.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, using Vite as the build tool and development server
- **UI Library**: Shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack Query (React Query) for server state management and data fetching
- **Routing**: Wouter for lightweight client-side routing
- **Styling**: Tailwind CSS with custom CSS variables for theming, featuring a dark iOS-inspired design
- **Form Handling**: React Hook Form with Zod validation via @hookform/resolvers

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Authentication**: Replit Auth integration with OpenID Connect (OIDC) using Passport.js
- **Session Management**: Express-session with PostgreSQL session store (connect-pg-simple)
- **File Uploads**: Multer for handling image uploads with local file storage
- **API Design**: RESTful API structure with consistent error handling middleware

### Data Storage Solutions
- **Primary Database**: PostgreSQL with Neon serverless driver
- **Schema Management**: Drizzle migrations in TypeScript
- **Session Storage**: PostgreSQL table for user sessions
- **File Storage**: Local filesystem for uploaded images (served via Express static middleware)
- **Database Tables**:
  - Users (Replit Auth integration)
  - Trips (travel planning data)
  - Journal Entries (travel memories with optional photos)
  - Packing Lists (trip-specific item lists)
  - Sessions (authentication session storage)

### Authentication and Authorization
- **Provider**: Replit Auth with OpenID Connect
- **Strategy**: Passport.js with openid-client strategy
- **Session Management**: Secure HTTP-only cookies with PostgreSQL backend storage
- **Authorization**: Route-level middleware protecting authenticated endpoints
- **User Management**: Automatic user creation and profile sync from Replit Auth

### Development and Build Pipeline
- **Development**: Concurrent frontend (Vite) and backend (tsx) development servers
- **Build Process**: Vite for frontend bundling, esbuild for backend compilation
- **Type Checking**: Shared TypeScript configuration across client/server/shared code
- **Path Aliases**: Organized imports with @ prefixes for clean module resolution

## External Dependencies

### Core Framework Dependencies
- **@neondatabase/serverless**: PostgreSQL serverless driver for database connectivity
- **drizzle-orm**: Type-safe ORM for database operations and migrations
- **express**: Web application framework for the backend API
- **passport**: Authentication middleware with OpenID Connect strategy
- **@tanstack/react-query**: Server state management and data fetching for React

### UI and Styling Dependencies
- **@radix-ui/***: Comprehensive set of headless UI primitives for accessible components
- **tailwindcss**: Utility-first CSS framework for styling
- **class-variance-authority**: Utility for creating variant-based component styles
- **clsx**: Utility for conditional CSS class names

### File Upload and Processing
- **multer**: Multipart form data handling for image uploads
- **@types/multer**: TypeScript definitions for Multer

### Session and Security
- **connect-pg-simple**: PostgreSQL session store for express-session
- **express-session**: Session middleware for Express applications

### Development Tools
- **vite**: Frontend build tool and development server
- **tsx**: TypeScript execution environment for Node.js
- **@replit/vite-plugin-runtime-error-modal**: Development error overlay
- **@replit/vite-plugin-cartographer**: Replit-specific development tooling