import type { Request, Response } from 'express';
import { userRepository } from '../repositories/user.repository';
import { HttpError } from '../utils/HttpError';
import { optionalString } from '../utils/validate';

/**
 * HTTP layer for users. The row is loaded (and provisioned on first request)
 * by the requireAuth middleware, so GET only has to echo it back.
 *
 * There is no /users/:id — a climber can only ever reach themselves.
 */
export const userController = {
  // GET /api/v1/users/me
  async me(req: Request, res: Response): Promise<void> {
    res.json({ data: req.user });
  },

  // PATCH /api/v1/users/me
  // Body: { first_name?, last_name? }
  //
  // Email is not editable here: it belongs to Supabase Auth, and changing only
  // this copy would leave the two disagreeing about who the account is. Use
  // supabase.auth.updateUser() for that; the next request re-provisions this row
  // from the token.
  async update(req: Request, res: Response): Promise<void> {
    const { first_name, last_name } = req.body ?? {};

    for (const frozen of ['email', 'status', 'auth_user_id', 'user_id']) {
      if (req.body?.[frozen] !== undefined) {
        throw HttpError.badRequest(`${frozen} cannot be changed here`);
      }
    }

    const user = await userRepository.update(req.user!.user_id, {
      first_name: optionalString(first_name, 'first_name', 100),
      last_name: optionalString(last_name, 'last_name', 100),
    });
    if (!user) throw HttpError.notFound('Profile not found');
    res.json({ data: user });
  },

  // DELETE /api/v1/users/me
  //
  // Closes the account rather than erasing it: status becomes 'withdrawn', which
  // requireAuth refuses on the next request. The climbing history is kept —
  // cascading the delete would take every session, report and injury with it,
  // and that is not what a mis-tap should cost. See userRepository.withdraw.
  async withdraw(req: Request, res: Response): Promise<void> {
    const user = await userRepository.withdraw(req.user!.user_id);
    if (!user) throw HttpError.notFound('Profile not found');
    res.json({ data: user });
  },
};
