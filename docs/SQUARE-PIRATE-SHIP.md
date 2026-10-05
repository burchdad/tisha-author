# Square + Pirate Ship fulfillment

The website uses two Square item payment links:

- Soft-cover: https://square.link/u/ZV1vr14t
- Hard-cover: https://square.link/u/uq2dEXqy

Square owns the checkout total and collects the buyer's payment, email, delivery
address, shipping charge, and tax. Pirate Ship imports paid Square orders so Tisha
can purchase and print labels without copying addresses.

## Square checklist

For each book item and payment link:

1. Enable **Shipping** as the fulfillment method. This makes the delivery-address
   fields appear during checkout.
2. Confirm the current item price: soft-cover $14.99 and hard-cover $16.99.
3. Enable customer quantity selection if buyers may order more than one copy.
4. Configure the amount customers pay for shipping. Pirate Ship does not send live
   rates to Square checkout, so use a Square shipping profile, fixed charge, or free
   shipping policy chosen by the client.
5. Review Square's automatic US tax settings and add only the jurisdictions where
   the business is registered to collect sales tax.
6. Enable payment-link transaction email notifications and make sure they reach
   `ridersmagicmark@gmail.com`. Square normally sends transactional notifications to
   the account owner or full-access team members; use that address for the appropriate
   Square team login or forward notifications from the current Square account email.
7. Place one test order for each link and verify that the Square order contains the
   buyer's full name, email, postal address, item, quantity, shipping charge, and tax.

## Connect Pirate Ship

1. In Pirate Ship, open **Settings > Integrations** and connect the client's Square
   account.
2. Keep the financial-status filter set to **Paid**.
3. Select the Square fulfillment location used by these online book orders.
4. Open **Ship > Import from Integrations**, refresh the data, and confirm the two test
   orders appear with their delivery addresses.
5. Select the order, enter or confirm the package dimensions and weight, compare rates,
   and purchase the label.
6. Print the label and confirm Pirate Ship updated the Square fulfillment status and
   tracking number.
7. Use either Square tracking emails or Pirate Ship tracking emails. Disable one source
   to prevent duplicate customer messages.

Pirate Ship imports orders and returns tracking information, but it does not calculate
the shipping amount shown to customers in Square. The client remains responsible for
the shipping policy and Square tax configuration.
