# Avalanche Simulation — Shallow Water (Saint-Venant) Model

This project implements a real-time two-dimensional snow avalanche simulation using a simplified form of the Saint-Venant (Shallow Water) equations solved with semi-Lagrangian advection.

The objective is to simulate gravity-driven snow flow over real terrain loaded from a GeoTIFF digital elevation model (DEM).

---

## Model Overview

The simulation is based on the depth-averaged Shallow Water Equations (SWE), adapted to represent dense snow flow over terrain.

The governing principles include:

- Mass conservation  
- Momentum conservation in the x-direction  
- Momentum conservation in the y-direction  

### State Variables

- `h` — snow depth  
- `u` — velocity in the x-direction  
- `v` — velocity in the y-direction  
- `Z` — terrain elevation (static, loaded from DEM)

Flow acceleration is driven by terrain slope:

- g = 9.81  
- Explicit time stepping  
- CFL-based dynamic stability control  

---

## Numerical Method

### Spatial Discretization

- Uniform Cartesian grid  
- Resolution: N × N mesh (N = 128)  
- Cell spacing: dx = SIZE / (N - 1)

### Momentum Update

Terrain gradient forces are computed using central differences:

u += dt * (-g * dZ/dx - friction * u)  
v += dt * (-g * dZ/dy - friction * v)

A linear friction term is included to approximate basal resistance.

### Advection Scheme

- Semi-Lagrangian advection (backward particle tracing)  
- Bilinear interpolation for sub-cell sampling  
- Small damping factor (0.999) applied per step for numerical stability  

### Stability

The time step is dynamically computed using a CFL condition:

dt = CFL * dx / max_speed  
dt = min(dt, 0.05)

This ensures stable explicit time integration under varying flow speeds.

### Boundary Conditions

- Fixed zero boundary condition  
- Snow depth is set to zero at all domain edges  

---

## Terrain Model

Terrain elevation is loaded at runtime from an SRTM GeoTIFF file via a Python backend service.

The backend:

- Extracts a region around a given latitude/longitude  
- Reads elevation values from DEM  
- Normalizes and scales elevation for rendering  
- Applies vertical exaggeration to emphasize slope gradients  

Barriers are implemented by locally increasing terrain elevation values, generating deflection in snow flow through modified gradients.

---

## Snow Source Model

Snow loading is interactive:

- User clicks inject snow mass onto terrain  
- A Gaussian distribution is applied around the selected point  
- Multiple load presets are available (light, medium, heavy)  
- Flow propagation begins immediately after injection  

---

## Visualization

Rendering is implemented using Three.js.

### Mesh Structure

- Terrain mesh (static)  
- Snow mesh (dynamic height field)  

Snow vertex positions are updated each frame using the depth field `h`.

### Heatmap Mode

Momentum magnitude is visualized via vertex coloring:

momentum = h * sqrt(u² + v²)

Color scale:
- Blue — low momentum  
- Yellow — medium momentum  
- Red — high momentum  

### Camera System

- Spherical orbit camera  
- Directional controls  
- Real-time interactive navigation  

---

## Physical Scope and Limitations

This model represents depth-averaged gravity-driven snow flow.

It does not include:

- Granular rheology models (e.g., Voellmy or μ(I) formulations)  
- Turbulent suspension effects  
- Snow entrainment processes  
- Three-dimensional powder cloud dynamics  
- Shock-capturing Riemann solvers  

The simulation is intended as a computational demonstration of terrain-driven shallow flow rather than a fully validated avalanche hazard model.

---

## Purpose

This project serves as:

- A numerical PDE demonstration  
- A real-time terrain-coupled shallow flow simulator  
- A computational prototype for avalanche dynamics  
- An educational exploration of semi-Lagrangian advection and CFL stability control  

---
