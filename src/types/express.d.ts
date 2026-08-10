declare global {
  namespace Express {
    interface Request {
      user?:{
        id: string;
        name: string;
        role: string;
        status: string;
        permissions: string[];
        attributes: Record<string, any>;
      };
      resource?: any;
    }
  }
}

export {}
