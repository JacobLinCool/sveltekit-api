export interface Post {
	id: string;
	title: string;
	content: string;
	author: string;
	date: string;
	password?: string;
}

export const posts = new Map<string, Post>();
