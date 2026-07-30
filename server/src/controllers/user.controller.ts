import type { Request, Response } from 'express';

/**
 * HTTP layer for users. The row is loaded (and provisioned on first request)
 * by the requireAuth middleware, so this only has to echo it back.
 */
export const userController = {
  // GET /api/v1/users/me
  async me(req: Request, res: Response): Promise<void> {
    res.json({ data: req.user });
  },
};
