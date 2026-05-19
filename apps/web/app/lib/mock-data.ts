// Mocked data for prototyping — will be replaced with DB persistence later

export interface Project {
  id: string;
  name: string;
}

export interface Room {
  id: string;
  projectId: string;
  name: string;
  width: number;
  depth: number;
}

export const MOCK_PROJECTS: Project[] = [
  { id: "p1", name: "Beach House" },
  { id: "p2", name: "City Apartment" },
];

export const MOCK_ROOMS: Room[] = [
  { id: "r1", projectId: "p1", name: "Living Room",  width: 6, depth: 5 },
  { id: "r2", projectId: "p1", name: "Master Bedroom", width: 4, depth: 4 },
  { id: "r3", projectId: "p2", name: "Studio",       width: 8, depth: 5 },
  { id: "r4", projectId: "p2", name: "Bathroom",     width: 3, depth: 2 },
];
