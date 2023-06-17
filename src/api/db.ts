export interface Post {
	id: string;
	title: string;
	content: string;
	author: string;
	date: string;
}

export const posts = new Map<string, Post>();
